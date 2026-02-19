"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Terminal, Cpu, Play, Loader2, Sparkles, UploadCloud, CheckCircle } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import dynamic from "next/dynamic";

// Dynamically import Plotly
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// --- THE BULLETPROOF JSON EXTRACTOR ---
// This safely pulls out multiple JSON objects even if they are mashed together in one string.
const extractJSONs = (str: string) => {
  const results = [];
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    
    if (!inString) {
      if (char === '{') {
        if (braceCount === 0) startIndex = i;
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          try {
            const jsonStr = str.substring(startIndex, i + 1);
            const parsed = JSON.parse(jsonStr);
            if (parsed.data) results.push(parsed); // Only keep valid Plotly objects
          } catch (e) {}
          startIndex = -1;
        }
      }
    }
  }
  return results;
};

// --- COMPONENTS ---
const FileUpload = ({ onUploadComplete }: { onUploadComplete: () => void }) => {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/upload`, { method: "POST", body: formData });
      if (res.ok) { setUploaded(true); onUploadComplete(); }
    } catch (error) { console.error("Upload error", error); } 
    finally { setUploading(false); }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, maxFiles: 1, accept: {'text/csv': ['.csv']} 
  });

  return (
    <div {...getRootProps()} className={`border border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 ${uploaded ? 'border-green-500/50 bg-green-500/10' : isDragActive ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}`}>
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        {uploaded ? <CheckCircle className="w-6 h-6 text-green-400" /> : <UploadCloud className="w-6 h-6 text-cyan-400" />}
        <p className="text-sm text-gray-200">{uploaded ? "Dataset Ready" : "Drop CSV Here"}</p>
      </div>
    </div>
  );
};

// --- MULTI-CHART RENDERER ---
const ResultRenderer = ({ content, chartData, chartType }: { content: string, chartData: string[], chartType: string | null }) => {
  
  // 1. Process and Flatten all charts using our bulletproof extractor
  let validPlotlyCharts: any[] = [];
  let validImages: string[] = [];

  if (chartType === 'plotly' && chartData) {
    chartData.forEach(chartStr => {
       validPlotlyCharts.push(...extractJSONs(chartStr));
    });
  } else if (chartType === 'png' && chartData) {
    validImages = [...chartData];
  }

  const totalCharts = chartType === 'plotly' ? validPlotlyCharts.length : validImages.length;

  return (
    <div className="space-y-8 w-full animate-in fade-in duration-500">
      
      {/* 1. Text Analysis */}
      <div className="markdown-content text-gray-300 leading-relaxed text-sm">
         <ReactMarkdown components={{ h1: ({...props}) => <h1 className="text-xl font-bold text-cyan-400 mt-4 mb-2" {...props} /> }}>
           {content}
         </ReactMarkdown>
      </div>
      
      {/* 2. Chart Grid (The Dashboard) */}
      {totalCharts > 0 && (
        <div className={`grid gap-6 ${totalCharts === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
          
          {chartType === 'plotly' ? (
            validPlotlyCharts.map((parsedChart, index) => (
              <div key={index} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40 p-2 flex justify-center min-h-[350px] shadow-2xl backdrop-blur-sm">
                <div className="w-full h-full">
                  <Plot
                    data={parsedChart.data}
                    layout={{ 
                        ...parsedChart.layout, 
                        paper_bgcolor: 'rgba(0,0,0,0)', 
                        plot_bgcolor: 'rgba(0,0,0,0)',
                        font: { color: '#ccc' },
                        autosize: true,
                        margin: { l: 40, r: 20, t: 40, b: 40 }
                    }}
                    style={{ width: '100%', height: '100%' }}
                    useResizeHandler={true}
                    config={{ responsive: true, displayModeBar: true }}
                  />
                </div>
              </div>
            ))
          ) : (
            validImages.map((chart, index) => (
              <div key={index} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40 p-2 flex justify-center min-h-[350px] shadow-2xl backdrop-blur-sm">
                <img src={chart} alt={`Chart ${index + 1}`} className="w-full h-auto object-contain bg-white rounded-lg" />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// --- MAIN PAGE ---
export default function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "done">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [chartData, setChartData] = useState<string[]>([]);
  const [chartType, setChartType] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [logs]);

  const handleAnalyze = async () => {
    if (!query) return;
    setStatus("thinking");
    setLogs(["Initializing Agent...", "Connecting to E2B Sandbox..."]);
    setResult(""); setChartData([]);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setLogs(prev => [...prev, "Analysis complete.", "Generating Dashboard..."]);
      setTimeout(() => {
        setResult(data.response);
        setChartData(data.chart_data);
        setChartType(data.chart_type);
        setStatus("done");
      }, 500);
    } catch (error) { setLogs(prev => [...prev, "❌ Error connecting to backend"]); setStatus("idle"); }
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-6 bg-black text-white font-sans relative">
      <div className="bg-noise fixed inset-0 z-0 opacity-20 pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-black via-zinc-900 to-black z-0 pointer-events-none" />
      
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 mb-8 text-center z-10 w-full">
        <h1 className="text-5xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">SPECTRA</h1>
        <p className="text-gray-400 text-sm tracking-[0.2em] uppercase font-medium">Autonomous Data Analyst</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-7xl flex-1 z-10 pb-40">
        <div className="lg:col-span-4 flex flex-col gap-6 h-full">
          <div className="glass-panel rounded-xl p-1 bg-white/5 backdrop-blur-md border border-white/10 shadow-lg">
            <FileUpload onUploadComplete={() => setHasFile(true)} />
          </div>
          <div className="glass-panel rounded-xl p-4 flex flex-col font-mono text-sm relative overflow-hidden flex-1 min-h-[300px] bg-zinc-900/80 border border-white/10">
            <div className="flex items-center gap-2 text-gray-500 mb-3 border-b border-white/10 pb-2"><Terminal className="w-4 h-4" />SYSTEM_LOGS</div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 text-green-400/90 p-1 font-mono text-xs">
              <AnimatePresence>
                {logs.map((log, i) => <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>{"> "}{log}</motion.div>)}
              </AnimatePresence>
              {status === "thinking" && <div className="text-cyan-400 mt-2 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Processing...</div>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 glass-panel rounded-xl p-8 flex flex-col relative min-h-[600px] bg-zinc-900/50 border border-white/10 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
             <div className="flex items-center gap-2 text-gray-400"><Cpu className="w-5 h-5" />ANALYSIS_OUTPUT</div>
             {status === "done" && <span className="text-[10px] font-bold text-green-400 px-2 py-1 rounded border border-green-500/30 bg-green-500/10">COMPLETE</span>}
          </div>
          <div className="flex-1 overflow-y-auto pr-2">
            {(result || chartData.length > 0) ? <ResultRenderer content={result} chartData={chartData} chartType={chartType} /> : 
             <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 opacity-50"><Cpu className="w-16 h-16" /><p>Ready for data...</p></div>}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 flex justify-center bg-gradient-to-t from-black via-black to-transparent">
        <div className="w-full max-w-3xl rounded-full p-2 pl-6 flex items-center gap-4 shadow-2xl ring-1 ring-white/20 bg-zinc-800">
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={hasFile ? "Ask questions..." : "Upload CSV first..."} className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-400 font-medium" onKeyDown={(e) => e.key === "Enter" && handleAnalyze()} />
          <button onClick={handleAnalyze} disabled={status === "thinking"} className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-full p-3 transition-all hover:scale-105 disabled:opacity-50 shadow-lg">{status === "thinking" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}</button>
        </div>
      </div>
    </main>
  );
}