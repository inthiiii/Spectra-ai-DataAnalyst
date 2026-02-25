"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useAnimationFrame } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Terminal, Cpu, Play, Loader2, Sparkles, UploadCloud, CheckCircle, Zap, Activity } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ─── Helpers ───────────────────────────────────────────────────────────────────
const extractJSONs = (str: string) => {
  const results: any[] = [];
  let braceCount = 0, startIndex = -1, inString = false, escapeNext = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') { if (braceCount === 0) startIndex = i; braceCount++; }
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          try { const p = JSON.parse(str.substring(startIndex, i + 1)); if (p.data) results.push(p); } catch {}
          startIndex = -1;
        }
      }
    }
  }
  return results;
};

// ─── Animated Background Grid ──────────────────────────────────────────────────
const GridBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    <svg className="absolute inset-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#00ffff" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
    {/* Orbs */}
    <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[120px] animate-pulse" style={{animationDuration:'6s'}}/>
    <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-violet-500/8 blur-[100px] animate-pulse" style={{animationDuration:'9s', animationDelay:'2s'}}/>
    <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-emerald-500/5 blur-[80px] animate-pulse" style={{animationDuration:'7s', animationDelay:'1s'}}/>
  </div>
);

// ─── Scanline effect ──────────────────────────────────────────────────────────
const Scanlines = () => (
  <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden opacity-[0.03]"
    style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)' }}
  />
);

// ─── Pulse ring for status indicator ─────────────────────────────────────────
const PulseRing = ({ active }: { active: boolean }) => (
  <span className="relative flex h-2.5 w-2.5">
    {active && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"/>}
    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${active ? 'bg-cyan-400' : 'bg-gray-600'}`}/>
  </span>
);

// ─── Typing text animation ────────────────────────────────────────────────────
const TypingText = ({ text }: { text: string }) => {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const id = setInterval(() => {
      setDisplayed(text.slice(0, ++i));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return <span>{displayed}<span className="animate-pulse text-cyan-400">▋</span></span>;
};

// ─── Streaming text word-by-word ─────────────────────────────────────────────
const StreamingMarkdown = ({ content, isStreaming }: { content: string; isStreaming: boolean }) => {
  const [visible, setVisible] = useState('');
  useEffect(() => {
    if (!isStreaming) { setVisible(content); return; }
    setVisible('');
    const words = content.split(' ');
    let i = 0;
    const id = setInterval(() => {
      setVisible(words.slice(0, ++i).join(' '));
      if (i >= words.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [content, isStreaming]);

  return (
    <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed text-sm">
      <ReactMarkdown components={{
        h1: ({...p}) => <h1 className="text-xl font-bold text-cyan-400 mt-4 mb-2 font-mono tracking-wide" {...p}/>,
        h2: ({...p}) => <h2 className="text-base font-semibold text-cyan-300/80 mt-4 mb-1.5 font-mono" {...p}/>,
        p: ({...p}) => <p className="text-gray-300/90 leading-7 mb-3" {...p}/>,
        code: ({...p}) => <code className="bg-cyan-950/40 border border-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono" {...p}/>,
        strong: ({...p}) => <strong className="text-white font-semibold" {...p}/>,
      }}>
        {visible}
      </ReactMarkdown>
      {isStreaming && visible.length < content.length && (
        <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse rounded-sm ml-1 align-middle"/>
      )}
    </div>
  );
};

// ─── File Upload ──────────────────────────────────────────────────────────────
const FileUpload = ({ onUploadComplete }: { onUploadComplete: () => void }) => {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploading(true);
    let p = 0;
    const prog = setInterval(() => { p = Math.min(p + Math.random() * 15, 90); setProgress(p); }, 150);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/upload`, { method: "POST", body: formData });
      if (res.ok) { clearInterval(prog); setProgress(100); setTimeout(() => { setUploaded(true); onUploadComplete(); }, 400); }
    } catch { clearInterval(prog); }
    finally { setUploading(false); }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, maxFiles: 1, accept: {'text/csv': ['.csv']} });

  return (
    <motion.div
      {...getRootProps()}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`relative border rounded-2xl p-6 text-center cursor-pointer transition-all duration-500 overflow-hidden
        ${uploaded ? 'border-emerald-500/40 bg-emerald-950/20' : isDragActive ? 'border-cyan-400/60 bg-cyan-950/30' : 'border-white/8 bg-white/[0.015] hover:border-cyan-500/30 hover:bg-cyan-950/10'}`}
    >
      <input {...getInputProps()} />
      {/* Scanning line on drag */}
      {isDragActive && (
        <motion.div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
          animate={{ top: ['0%', '100%'] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}/>
      )}
      {/* Progress bar */}
      {uploading && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/50">
          <motion.div className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
            style={{ width: `${progress}%` }} transition={{ duration: 0.2 }}/>
        </div>
      )}
      <div className="flex flex-col items-center gap-3">
        <motion.div
          animate={uploaded ? { scale: [1, 1.2, 1] } : isDragActive ? { y: [-3, 3, -3] } : {}}
          transition={{ duration: 0.6, repeat: isDragActive ? Infinity : 0 }}
          className={`p-3 rounded-2xl ${uploaded ? 'bg-emerald-500/15 shadow-[0_0_20px_rgba(52,211,153,0.25)]' : 'bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.15)]'}`}
        >
          {uploading ? <Loader2 className="w-6 h-6 text-cyan-400 animate-spin"/> :
           uploaded ? <CheckCircle className="w-6 h-6 text-emerald-400"/> :
           <UploadCloud className="w-6 h-6 text-cyan-400"/>}
        </motion.div>
        <div>
          <p className="text-xs font-bold tracking-widest uppercase text-gray-300 font-mono">
            {uploading ? `Uploading... ${Math.round(progress)}%` : uploaded ? 'Dataset Loaded' : isDragActive ? 'Release to Ingest' : 'Drop CSV / Click'}
          </p>
          {!uploaded && !uploading && <p className="text-[10px] text-gray-600 mt-1 font-mono">.csv files only</p>}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Log Line ─────────────────────────────────────────────────────────────────
const LogLine = ({ log, index }: { log: string; index: number }) => {
  const isError = log.includes('❌');
  const isSuccess = log.includes('complete') || log.includes('Ready') || log.includes('success');
  return (
    <motion.div
      initial={{ opacity: 0, x: -12, filter: 'blur(4px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`flex gap-2 items-start text-[11px] font-mono leading-5 ${isError ? 'text-red-400' : isSuccess ? 'text-emerald-400' : 'text-cyan-400/70'}`}
    >
      <span className="text-gray-600 select-none shrink-0">{String(index + 1).padStart(2, '0')}</span>
      <span className="text-cyan-600 select-none shrink-0">›</span>
      <span>{log}</span>
    </motion.div>
  );
};

// ─── Result Renderer ──────────────────────────────────────────────────────────
const ResultRenderer = ({ content, chartData, chartType, isStreaming }: { content: string; chartData: string[]; chartType: string | null; isStreaming: boolean }) => {
  let validPlotlyCharts: any[] = [];
  let validImages: string[] = [];

  if (chartType === 'plotly' && chartData) {
    chartData.forEach(chartStr => {
      try {
        const parsed = JSON.parse(chartStr);
        if (parsed.data) validPlotlyCharts.push(parsed);
      } catch {
        validPlotlyCharts.push(...extractJSONs(chartStr));
      }
    });
  } else if (chartType === 'png' && chartData) {
    validImages = [...chartData];
  }
  
  const totalCharts = chartType === 'plotly' ? validPlotlyCharts.length : validImages.length;

  return (
    <div className="space-y-6 w-full">
      <StreamingMarkdown content={content} isStreaming={isStreaming} />
      {totalCharts > 0 && (
        <div className={`grid gap-5 ${totalCharts === 1 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
          {chartType === 'plotly' ? validPlotlyCharts.map((chart, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.1 }}
              className="relative group rounded-2xl overflow-hidden border border-white/5 bg-black/60 p-4 min-h-[360px] shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-all duration-700 pointer-events-none"/>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"/>
              <Plot data={chart.data}
                layout={{ ...chart.layout, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                  font: { color: '#9ca3af', family: 'JetBrains Mono, monospace' }, autosize: true, margin: { l: 40, r: 20, t: 40, b: 40 } }}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler config={{ responsive: true, displayModeBar: true }}/>
            </motion.div>
          )) : validImages.map((src, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="rounded-2xl overflow-hidden border border-white/5 bg-black/60 p-4 min-h-[360px] shadow-2xl">
              <img src={src} alt={`Chart ${i + 1}`} className="w-full h-auto object-contain rounded-xl"/>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "done" | "profiling">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [chartData, setChartData] = useState<string[]>([]);
  const [chartType, setChartType] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [datasetSummary, setDatasetSummary] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const handleUploadComplete = async () => {
    setHasFile(true); setStatus("profiling");
    setLogs(["File ingested successfully.", "Parsing column schema...", "Inferring data types...", "Generating AI query suggestions..."]);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/profile`);
      const data = await res.json();
      setDatasetSummary(data.summary); setSuggestions(data.suggestions);
      setStatus("idle");
      setLogs(prev => [...prev, "✓ Profiling complete — Spectra is ready."]);
    } catch {
      setLogs(prev => [...prev, "❌ Failed to profile dataset."]);
      setStatus("idle");
    }
  };

  const handleAnalyze = async (overrideQuery?: string) => {
    const finalQuery = overrideQuery || query;
    if (!finalQuery.trim()) return;
    setQuery(""); setStatus("thinking"); setIsStreaming(false);
    setLogs(["Initializing analysis context...", "Spawning E2B sandbox...", `Processing: "${finalQuery}"`]);
    setResult(""); setChartData([]); setDownloadReady(false);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery }),
      });
      const data = await res.json();
      setLogs(prev => [...prev, "✓ Execution complete.", "Rendering output..."]);
      setTimeout(() => {
        setIsStreaming(true);
        setResult(data.response);
        setChartData(data.chart_data);
        setChartType(data.chart_type);
        setDownloadReady(data.file_ready);
        setStatus("done");
        setTimeout(() => setIsStreaming(false), (data.response?.split(' ').length || 0) * 32 + 500);
      }, 400);
    } catch {
      setLogs(prev => [...prev, "❌ Error connecting to backend."]);
      setStatus("idle");
    }
  };

  const isActive = status === "thinking" || status === "profiling";

  return (
    <main className="h-[100dvh] flex flex-col bg-[#03060a] text-white overflow-hidden relative"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      
      <GridBackground />
      <Scanlines />

      {/* ── HEADER ── */}
      <motion.header
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex-shrink-0 flex items-center justify-between px-8 py-4 z-10 border-b border-white/[0.04]"
      >
        <div className="flex-1 flex justify-center items-center gap-3">
          <div className="relative">
            <div
              className="w-8 h-8 rounded-lg border border-cyan-500/30 flex items-center justify-center"
              style={{ background: 'radial-gradient(circle at 30% 30%, rgba(6,182,212,0.2), transparent)' }}
            >
              <Sparkles className="w-4 h-4 text-cyan-400"/>
            </div>
            <div className="absolute inset-0 blur-md bg-cyan-500/20 rounded-lg"/>
          </div>
          <div className="text-center">
            {/* FIX 1: Solid glowing cyan color for title instead of transparent background clip */}
            <motion.h1
              className="text-xl font-black tracking-[0.35em] leading-none text-cyan-400 drop-shadow-md"
              animate={{ filter: ['drop-shadow(0 0 8px rgba(34,211,238,0.4))', 'drop-shadow(0 0 20px rgba(34,211,238,0.8))', 'drop-shadow(0 0 8px rgba(34,211,238,0.4))'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              SPECTRA
            </motion.h1>
            <p className="text-[9px] text-gray-600 tracking-[0.3em] uppercase mt-0.5">Autonomous Data Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/8 bg-white/[0.02]">
          <PulseRing active={isActive}/>
          <span className="text-[10px] tracking-widest uppercase text-gray-500">
            {status === 'idle' ? 'Standby' : status === 'profiling' ? 'Profiling' : status === 'thinking' ? 'Processing' : 'Complete'}
          </span>
        </div>
      </motion.header>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-hidden z-10 grid grid-cols-1 lg:grid-cols-12 gap-0">

        {/* LEFT PANEL */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="lg:col-span-4 flex flex-col gap-4 p-4 border-r border-white/[0.04] overflow-hidden"
        >
          <FileUpload onUploadComplete={handleUploadComplete}/>

          <AnimatePresence>
            {datasetSummary && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-violet-500/15 bg-violet-950/10 px-4 py-3"
              >
                <p className="text-[10px] uppercase tracking-widest text-violet-400 mb-1.5 font-bold">Dataset Profile</p>
                <p className="text-[11px] text-gray-400 leading-5">{datasetSummary}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 rounded-2xl border border-white/[0.06] bg-black/30 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"/>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"/>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60"/>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                <Terminal className="w-3 h-3 text-gray-600"/>
                <span className="text-[10px] tracking-widest text-gray-600 uppercase">system.log</span>
              </div>
              {isActive && (
                <motion.div className="ml-auto flex items-center gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Activity className="w-3 h-3 text-cyan-400"/>
                  <span className="text-[9px] text-cyan-400 animate-pulse">LIVE</span>
                </motion.div>
              )}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-white/5">
              <AnimatePresence initial={false}>
                {logs.map((log, i) => <LogLine key={`${log}-${i}`} log={log} index={i}/>)}
              </AnimatePresence>
              {isActive && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-cyan-400/60 font-mono">
                    {status === 'profiling' ? 'Profiling dataset' : 'Executing logic'}
                  </span>
                  <span className="flex gap-0.5">
                    {[0,1,2].map(i => (
                      <motion.span key={i} className="w-1 h-1 bg-cyan-400 rounded-full inline-block"
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}/>
                    ))}
                  </span>
                </motion.div>
              )}
            </div>
          </div>
        </motion.aside>

        {/* RIGHT PANEL */}
        <motion.section
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="lg:col-span-8 flex flex-col overflow-hidden relative"
        >
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.04]">
            <div className="flex items-center gap-2 text-gray-600">
              <Cpu className="w-3.5 h-3.5"/>
              <span className="text-[10px] tracking-widest uppercase">analysis_output</span>
            </div>
            <AnimatePresence>
              {status === 'done' && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] font-bold text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-950/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block"/>
                  COMPLETE
                </motion.span>
              )}
              {status === 'thinking' && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[10px] font-bold text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-950/20 flex items-center gap-1.5">
                  <Loader2 className="w-2.5 h-2.5 animate-spin"/>
                  PROCESSING
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin scrollbar-thumb-white/5">
            <AnimatePresence mode="wait">
              {(result || chartData.length > 0) ? (
                <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <ResultRenderer content={result} chartData={chartData} chartType={chartType} isStreaming={isStreaming}/>
                  <AnimatePresence>
                    {downloadReady && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 flex justify-center">
                        <button
                          onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/download`, '_blank')}
                          className="group relative flex items-center gap-2.5 px-7 py-3 rounded-full font-bold text-sm overflow-hidden transition-all hover:scale-105"
                          style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}
                        >
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"/>
                          <UploadCloud className="w-4 h-4 rotate-180"/>
                          Download Extracted Dataset
                          <div className="absolute inset-0 blur-xl opacity-30 bg-gradient-to-r from-cyan-500 to-violet-500 -z-10"/>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : status === 'thinking' ? (
                <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col gap-6 pt-8">
                  {[90, 75, 60, 45, 80].map((w, i) => (
                    <motion.div key={i}
                      className="h-3 rounded-full bg-gradient-to-r from-cyan-950/60 to-violet-950/30"
                      style={{ width: `${w}%` }}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                  <div className="flex items-center gap-3 mt-4">
                    <div className="flex gap-1">
                      {[0,1,2,3,4].map(i => (
                        <motion.div key={i} className="w-1 h-6 bg-cyan-500/40 rounded-full"
                          animate={{ scaleY: [1, 2.5, 1], opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}/>
                      ))}
                    </div>
                    <span className="text-xs text-cyan-400/60 font-mono">
                      <TypingText text="Spectra is analyzing your data..."/>
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center gap-5 py-16 text-center">
                  <div className="relative">
                    <motion.div
                      animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.3, 0.15] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 bg-cyan-500 blur-3xl rounded-full"
                    />
                    <Cpu className="w-16 h-16 text-gray-700 relative z-10" strokeWidth={1}/>
                  </div>
                  <div className="max-w-xs space-y-2">
                    <p className="text-gray-500 text-sm leading-relaxed">
                      {datasetSummary || "Upload a CSV to initialize the analysis engine. Spectra will profile your data and suggest intelligent queries."}
                    </p>
                  </div>
                  <div className="relative w-24 h-24 flex items-center justify-center mt-2">
                    {[0,1,2].map(i => (
                      <motion.div key={i}
                        className="absolute rounded-full border border-cyan-500/10"
                        style={{ width: `${(i+1)*32}px`, height: `${(i+1)*32}px` }}
                        animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.05, 0.2] }}
                        transition={{ duration: 3, repeat: Infinity, delay: i * 0.6 }}
                      />
                    ))}
                    <div className="w-2 h-2 bg-cyan-500/30 rounded-full"/>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-shrink-0 px-4 pt-4 pb-12 md:pb-16 border-t border-white/[0.04]">
            <AnimatePresence>
              {suggestions.length > 0 && !isActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2 mb-3"
                >
                  <div className="w-full flex items-center gap-1.5 mb-1">
                    <Zap className="w-3 h-3 text-cyan-400 fill-cyan-400"/>
                    <span className="text-[11px] uppercase tracking-widest text-cyan-400/70 font-bold">Suggested queries</span>
                  </div>
                  {suggestions.map((s, i) => (
                    <motion.button key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                      onClick={() => handleAnalyze(s)}
                      className="text-xs px-4 py-2 rounded-full border border-cyan-500/25 bg-cyan-950/25 hover:border-cyan-400/50 hover:bg-cyan-900/30 text-cyan-200 hover:text-white transition-all duration-200 font-mono shadow-sm hover:shadow-cyan-500/10"
                    >
                      {s}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition-all duration-300
              ${isActive ? 'border-cyan-500/20 bg-cyan-950/10' : 'border-white/8 bg-white/[0.02] hover:border-white/15 focus-within:border-cyan-500/40 focus-within:bg-cyan-950/10'}`}>
              <span className="text-cyan-600 font-mono text-sm select-none shrink-0">›_</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                disabled={isActive || !hasFile}
                placeholder={!hasFile ? "Upload a CSV to begin..." : isActive ? "Processing..." : "Ask Spectra anything about your data..."}
                className="flex-1 bg-transparent border-none outline-none text-[13px] placeholder:text-gray-600 font-mono disabled:opacity-40 min-w-0"
                style={{ color: '#ffffff' }}
              />
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleAnalyze()}
                disabled={isActive || !hasFile || !query.trim()}
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-all disabled:opacity-30"
                style={{ background: isActive ? 'rgba(6,182,212,0.1)' : 'linear-gradient(135deg, #06b6d4, #6366f1)' }}
              >
                {isActive ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400"/> : <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5"/>}
              </motion.button>
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}