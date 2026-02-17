"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Terminal, Cpu, Play, Loader2, Sparkles, UploadCloud, CheckCircle } from "lucide-react";
import ReactMarkdown from 'react-markdown';

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
      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        setUploaded(true);
        onUploadComplete();
      } else {
        console.error("Upload failed");
      }
    } catch (error) {
      console.error("Upload error", error);
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    maxFiles: 1, 
    accept: {'text/csv': ['.csv']} 
  });

  return (
    <div 
      {...getRootProps()} 
      className={`
        border border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300
        ${uploaded 
          ? 'border-green-500/50 bg-green-500/10' 
          : isDragActive 
            ? 'border-cyan-400 bg-cyan-400/10' 
            : 'border-white/10 hover:border-white/30 hover:bg-white/5'
        }
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        {uploaded ? (
          <>
            <div className="p-3 rounded-full bg-green-500/20 text-green-400">
              <CheckCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-green-200">Dataset Ready</p>
          </>
        ) : (
          <>
            <div className={`p-3 rounded-full ${isDragActive ? 'bg-cyan-400/20 text-cyan-400' : 'bg-white/5 text-gray-400'}`}>
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-200">
                {uploading ? "Uploading..." : "Drop CSV dataset here"}
              </p>
              <p className="text-xs text-gray-500">or click to browse</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- SIMPLIFIED RENDERER ---
// Now takes text and chart separately. No regex magic needed.
const ResultRenderer = ({ content, chartImage }: { content: string, chartImage: string | null }) => {
  return (
    <div className="space-y-6 w-full animate-in fade-in duration-500">
      <div className="markdown-content text-gray-300 leading-relaxed text-sm">
         <ReactMarkdown 
           components={{
             h1: ({...props}) => <h1 className="text-xl font-bold text-cyan-400 mt-6 mb-2" {...props} />,
             h2: ({...props}) => <h2 className="text-lg font-semibold text-purple-400 mt-4 mb-2" {...props} />,
             p: ({...props}) => <p className="mb-3 last:mb-0" {...props} />,
             code: ({className, children, ...props}) => {
               const isBlock = /language-(\w+)/.test(className || '');
               return isBlock ? (
                 <pre className="mt-2 mb-2 rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-xs text-yellow-200 font-mono shadow-inner">
                   <code className={className} {...props}>{children}</code>
                 </pre>
               ) : (
                 <code className="bg-white/10 px-1.5 py-0.5 rounded text-yellow-300 font-mono text-xs" {...props}>{children}</code>
               )
             }
           }}
         >
           {content}
         </ReactMarkdown>
      </div>
      
      {/* EXPLICIT CHART DISPLAY */}
      {chartImage && (
        <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-white/5 p-4 flex justify-center">
          <img 
            src={chartImage} 
            alt="Generated Analysis Chart" 
            className="w-full h-auto object-contain bg-white rounded-lg shadow-2xl"
            style={{ maxHeight: '600px', maxWidth: '100%' }}
          />
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
  const [chartData, setChartData] = useState<string | null>(null); // NEW STATE
  const [hasFile, setHasFile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleAnalyze = async () => {
    if (!query) return;
    setStatus("thinking");
    setLogs(["Initializing Agent...", "Connecting to E2B Sandbox..."]);
    setResult("");
    setChartData(null); // Reset chart

    try {
      const res = await fetch("http://localhost:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();
      
      setLogs((prev) => [...prev, "Code execution complete.", "Rendering output..."]);
      setTimeout(() => {
        setResult(data.response);
        setChartData(data.chart_data); // CAPTURE THE CHART SEPARATELY
        setStatus("done");
      }, 500);

    } catch (error) {
      setLogs((prev) => [...prev, "❌ Error connecting to backend"]);
      setStatus("idle");
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-6 bg-black text-white font-sans relative">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-800/20 via-black to-black z-0 pointer-events-none" />
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 z-0 pointer-events-none" />

      {/* HEADER */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="mt-8 mb-8 text-center z-10 w-full"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <Sparkles className="w-8 h-8 text-cyan-400" />
          <h1 className="text-5xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
            SPECTRA
          </h1>
        </div>
        <p className="text-gray-400 text-sm tracking-[0.2em] uppercase font-medium">Autonomous Data Analyst</p>
      </motion.div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-7xl flex-1 z-10 pb-40">
        
        {/* LEFT COLUMN: Controls & Logs */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full">
          <div className="glass-panel rounded-xl p-1 bg-white/5 backdrop-blur-md border border-white/10 shadow-lg">
            <FileUpload onUploadComplete={() => setHasFile(true)} />
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col font-mono text-sm relative overflow-hidden flex-1 min-h-[300px] bg-zinc-900/80 border border-white/10">
            <div className="flex items-center gap-2 text-gray-500 mb-3 border-b border-white/10 pb-2">
              <Terminal className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-wider">SYSTEM_LOGS</span>
            </div>
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 text-green-400/90 p-1 font-mono text-xs">
              <AnimatePresence>
                {logs.map((log, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2"
                  >
                    <span className="text-gray-600 select-none">{">"}</span>
                    {log}
                  </motion.div>
                ))}
              </AnimatePresence>
              {status === "thinking" && (
                <motion.div 
                  animate={{ opacity: [0.4, 1, 0.4] }} 
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-cyan-400 mt-2 flex items-center gap-2"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Processing...
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Results */}
        <div className="lg:col-span-8 glass-panel rounded-xl p-8 flex flex-col relative min-h-[600px] bg-zinc-900/50 border border-white/10 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2 text-gray-400">
              <Cpu className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider">ANALYSIS_OUTPUT</span>
            </div>
            {status === "done" && (
              <span className="text-[10px] font-bold text-green-400 px-2 py-1 rounded border border-green-500/30 bg-green-500/10">
                COMPLETE
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            {(result || chartData) ? (
              <motion.div 
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full"
              >
                <ResultRenderer content={result} chartImage={chartData} />
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 opacity-50">
                <div className="relative">
                  <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full" />
                  <Cpu className="w-16 h-16 relative z-10" />
                </div>
                <p className="text-sm font-medium">Ready for data ingestion...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* INPUT BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 flex justify-center bg-gradient-to-t from-black via-black to-transparent">
        <div className="w-full max-w-3xl rounded-full p-2 pl-6 flex items-center gap-4 shadow-2xl ring-1 ring-white/20 bg-zinc-800">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={hasFile ? "Ask questions about your data..." : "Upload a CSV first, then ask questions..."}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-400 font-medium text-base"
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          />
          <button 
            onClick={handleAnalyze}
            disabled={status === "thinking"}
            className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-full p-3 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
          >
            {status === "thinking" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
          </button>
        </div>
      </div>
    </main>
  );
}