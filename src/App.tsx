/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  Settings, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  Loader2,
  Headphones,
  BookOpen,
  Sparkles
} from 'lucide-react';
import {
  extractTextFromPDF,
  extractTextFromDOCX,
  splitIntoChunks,
  validateFile,
  ALLOWED_FILE_TYPES,
} from './lib/fileParser';
import { generateSpeech, VoiceName, VOICE_NAMES } from './lib/gemini';
import { pcmToWav } from './lib/audio';
import { cn } from './lib/utils';

const VOICES: { name: VoiceName; description: string }[] = [
  { name: 'Zephyr', description: 'Warm & Professional' },
  { name: 'Kore', description: 'Clear & Friendly' },
  { name: 'Fenrir', description: 'Deep & Authoritative' },
  { name: 'Puck', description: 'Energetic & Bright' },
  { name: 'Charon', description: 'Calm & Steady' },
];

/**
 * Builds a playable URL from a validated TTS response. generateSpeech has
 * already checked that the mime type is an audio type and that the payload is
 * base64, so this can never produce, say, a `data:text/html` URL.
 */
function toAudioUrl(data: string, mimeType: string): string {
  if (mimeType.toLowerCase().includes('audio/pcm') || mimeType.toLowerCase().includes('audio/l16')) {
    return pcmToWav(data, 24000);
  }
  return `data:${mimeType};base64,${data}`;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Zephyr');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChunkRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (activeChunkRef.current) {
      activeChunkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentChunkIndex]);

  const processFile = async (uploadedFile: File) => {
    // Validate before reading anything: size cap, extension and reported type.
    const validationError = validateFile(uploadedFile);
    if (validationError) {
      alert(validationError);
      return;
    }

    setFile(uploadedFile);
    setIsParsing(true);

    try {
      const isPdf =
        uploadedFile.type === ALLOWED_FILE_TYPES.pdf ||
        uploadedFile.name.toLowerCase().endsWith('.pdf');

      const extractedText = isPdf
        ? await extractTextFromPDF(uploadedFile)
        : await extractTextFromDOCX(uploadedFile);

      setText(extractedText);
      const textChunks = splitIntoChunks(extractedText, 400);
      setChunks(textChunks);
      setCurrentChunkIndex(0);
    } catch (error) {
      console.error('Parsing error:', error);
      const message = error instanceof Error ? error.message : 'Failed to parse file.';
      alert(message);
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) void processFile(uploadedFile);
  };

  const playCurrentChunk = async (index: number) => {
    if (index >= chunks.length) {
      setIsPlaying(false);
      return;
    }

    setIsLoadingAudio(true);
    try {
      const { data, mimeType } = await generateSpeech(chunks[index], { voiceName: selectedVoice });

      const audioUrl = toAudioUrl(data, mimeType);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.play();
      }
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      if (audioRef.current?.src) {
        audioRef.current.play();
      } else {
        playCurrentChunk(currentChunkIndex);
      }
    }
  };

  const stopPlayback = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.src = '';
    setIsPlaying(false);
    setCurrentChunkIndex(0);
  };

  const handleAudioEnded = () => {
    if (currentChunkIndex + 1 < chunks.length) {
      const nextIndex = currentChunkIndex + 1;
      setCurrentChunkIndex(nextIndex);
      playCurrentChunk(nextIndex);
    } else {
      setIsPlaying(false);
      setCurrentChunkIndex(0);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-orange/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-purple/20 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-brand-blue/10 rounded-full blur-[100px] animate-pulse delay-2000" />
      </div>

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div 
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl text-center space-y-8"
          >
            <div className="space-y-4">
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-brand-orange text-sm font-medium mb-4"
              >
                <Sparkles className="w-4 h-4" />
                AI-Powered Audiobooks
              </motion.div>
              <h1 className="text-6xl md:text-8xl font-serif font-bold tracking-tight leading-none">
                Vox<span className="text-gradient">Book</span>
              </h1>
              <p className="text-xl text-white/60 max-w-lg mx-auto">
                Transform your PDFs and DOCX files into immersive audio experiences with natural, human-like AI voices.
              </p>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile) void processFile(droppedFile);
              }}
              className="group relative cursor-pointer"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-orange via-brand-purple to-brand-blue rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
              <div className="relative glass rounded-3xl p-12 flex flex-col items-center gap-6 transition-all duration-300 group-hover:bg-white/10">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                  {isParsing ? (
                    <Loader2 className="w-10 h-10 text-brand-orange animate-spin" />
                  ) : (
                    <Upload className="w-10 h-10 text-brand-orange" />
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold">
                    {isParsing ? 'Processing your book...' : 'Drop your file here'}
                  </h3>
                  <p className="text-white/40">PDF or DOCX • Up to 50MB</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".pdf,.docx" 
                  className="hidden" 
                />
              </div>
            </div>

            <div className="flex justify-center gap-8 pt-8">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full glass flex items-center justify-center">
                  <Volume2 className="w-5 h-5 text-white/60" />
                </div>
                <span className="text-xs text-white/40 uppercase tracking-widest font-bold">Natural Voices</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full glass flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white/60" />
                </div>
                <span className="text-xs text-white/40 uppercase tracking-widest font-bold">AI Highlighting</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full glass flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-white/60" />
                </div>
                <span className="text-xs text-white/40 uppercase tracking-widest font-bold">Immersive Audio</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="reader"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-5xl h-[90vh] flex flex-col gap-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between glass rounded-2xl p-4 px-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    stopPlayback();
                    setFile(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-orange/20 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-brand-orange" />
                  </div>
                  <div>
                    <h2 className="font-semibold truncate max-w-[200px] md:max-w-md">{file.name}</h2>
                    <p className="text-xs text-white/40">
                      {chunks.length} segments • Segment {currentChunkIndex + 1}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 mr-4">
                  <span className="text-xs text-white/40 uppercase tracking-widest font-bold">Voice:</span>
                  <select 
                    value={selectedVoice}
                    onChange={(e) => {
                      const candidate = e.target.value;
                      if (!VOICE_NAMES.includes(candidate as VoiceName)) return;
                      const newVoice = candidate as VoiceName;
                      setSelectedVoice(newVoice);
                      // Play a small preview if not already playing a book
                      if (!isPlaying && !isLoadingAudio) {
                        generateSpeech("Hello, I am " + newVoice, { voiceName: newVoice })
                          .then(({ data, mimeType }) => {
                            if (audioRef.current) {
                              audioRef.current.src = toAudioUrl(data, mimeType);
                              audioRef.current.play();
                            }
                          })
                          .catch((error) => console.error('Voice preview failed:', error));
                      }
                    }}
                    className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer hover:text-brand-orange transition-colors"
                  >
                    {VOICES.map(v => (
                      <option key={v.name} value={v.name} className="bg-[#1a1a1a]">{v.name} ({v.description})</option>
                    ))}
                  </select>
                </div>
                <button className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Reader Area */}
            <div className="flex-1 glass rounded-3xl overflow-hidden flex flex-col md:flex-row">
              {/* Main Text View */}
              <div className="flex-1 p-8 md:p-12 overflow-y-auto relative">
                <div className="max-w-2xl mx-auto space-y-8">
                  {chunks.map((chunk, idx) => (
                    <motion.p 
                      key={idx}
                      ref={idx === currentChunkIndex ? activeChunkRef : null}
                      onClick={() => {
                        setCurrentChunkIndex(idx);
                        if (isPlaying) playCurrentChunk(idx);
                      }}
                      animate={{ 
                        opacity: idx === currentChunkIndex ? 1 : 0.3,
                        scale: idx === currentChunkIndex ? 1.02 : 1,
                        color: idx === currentChunkIndex ? '#fff' : 'rgba(255,255,255,0.4)'
                      }}
                      className={cn(
                        "text-xl md:text-2xl leading-relaxed font-serif transition-all duration-500 p-2 rounded-lg cursor-pointer hover:bg-white/5",
                        idx === currentChunkIndex ? "text-white bg-white/10" : "text-white/40"
                      )}
                    >
                      {chunk}
                    </motion.p>
                  ))}
                </div>
                
                {/* Gradient Fades for Scroll */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[#0a0a0a]/50 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0a0a0a]/50 to-transparent pointer-events-none" />
              </div>

              {/* Sidebar / Stats */}
              <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-white/10 p-6 space-y-8 bg-white/[0.02]">
                <div className="space-y-4">
                  <h3 className="text-xs text-white/40 uppercase tracking-widest font-bold flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> Reading Progress
                  </h3>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}
                      className="h-full bg-gradient-to-r from-brand-orange to-brand-purple"
                    />
                  </div>
                  <p className="text-sm text-white/60">
                    {Math.round(((currentChunkIndex + 1) / chunks.length) * 100)}% completed
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs text-white/40 uppercase tracking-widest font-bold">Playback Speed</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                      <button
                        key={speed}
                        onClick={() => setPlaybackSpeed(speed)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-bold transition-all",
                          playbackSpeed === speed ? "bg-brand-orange text-white" : "glass hover:bg-white/10"
                        )}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <div className="p-4 rounded-2xl bg-brand-orange/10 border border-brand-orange/20 space-y-2">
                    <p className="text-xs font-bold text-brand-orange uppercase tracking-tighter">AI Tip</p>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Try the <span className="text-brand-orange">Zephyr</span> voice for non-fiction and <span className="text-brand-purple">Kore</span> for storytelling.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="glass rounded-3xl p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    const prev = Math.max(0, currentChunkIndex - 1);
                    setCurrentChunkIndex(prev);
                    if (isPlaying) playCurrentChunk(prev);
                  }}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                
                <button 
                  onClick={togglePlay}
                  disabled={isLoadingAudio}
                  className="w-16 h-16 rounded-2xl bg-brand-orange flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-orange/20 disabled:opacity-50"
                >
                  {isLoadingAudio ? (
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-8 h-8 text-white fill-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white fill-white ml-1" />
                  )}
                </button>

                <button 
                  onClick={() => {
                    const next = Math.min(chunks.length - 1, currentChunkIndex + 1);
                    setCurrentChunkIndex(next);
                    if (isPlaying) playCurrentChunk(next);
                  }}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className="flex items-center gap-6">
                <div className="hidden md:flex items-center gap-3 glass px-4 py-2 rounded-2xl">
                  <Volume2 className="w-4 h-4 text-white/40" />
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    defaultValue="1"
                    onChange={(e) => {
                      if (audioRef.current) audioRef.current.volume = parseFloat(e.target.value);
                    }}
                    className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-brand-orange"
                  />
                </div>
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-xs text-white/40 uppercase tracking-widest font-bold">Now Reading</span>
                  <span className="text-sm font-medium text-brand-orange">Segment {currentChunkIndex + 1} of {chunks.length}</span>
                </div>
                <button 
                  onClick={stopPlayback}
                  className="p-4 glass hover:bg-white/10 rounded-2xl transition-colors text-white/60 hover:text-white"
                >
                  <Square className="w-5 h-5 fill-current" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio 
        ref={audioRef} 
        onEnded={handleAudioEnded}
        className="hidden"
      />
    </div>
  );
}
