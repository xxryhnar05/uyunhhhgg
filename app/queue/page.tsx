"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

// --- Interfaces ---
interface ActiveSession {
  id: string;
  title: string;
  status: "active" | "closed";
  started_at: string;
}

export default function QueuePage() {
  const router = useRouter();
  
  // UI State
  const [currentStep, setCurrentStep] = useState<"home" | "queue">("home");
  const [hasMounted, setHasMounted] = useState(false);
  
  // Logic State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const fetchActiveSession = async (silent = false) => {
    if (!silent) setCheckingSession(true);
    const { data, error } = await supabase
      .from("queue_sessions")
      .select("id, title, status, started_at")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setActiveSession(null);
      if (!silent) setCheckingSession(false);
      return null;
    }
    const session = (data as ActiveSession | null) || null;
    setActiveSession(session);
    if (!silent) setCheckingSession(false);
    return session;
  };

  useEffect(() => {
    fetchActiveSession();
    let subscription: any = null;

    const setupRealtimeListener = () => {
      try {
        subscription = supabase
          .channel("queue-page-session-listener")
          .on("postgres_changes", { event: "*", schema: "public", table: "queue_sessions" }, () => {
            fetchActiveSession(true);
          })
          .subscribe();
      } catch (err) {
        console.error("Real-time setup failed:", err);
      }
    };

    setupRealtimeListener();
    const pollInterval = setInterval(() => fetchActiveSession(true), 1000);
    pollRef.current = pollInterval;

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      router.push("/admin");
    } catch (err: any) {
      setError("Login gagal! Periksa email dan password.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !phone.trim()) {
      setError("Nama dan nomor HP wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const latestSession = await fetchActiveSession(true);
      if (!latestSession) throw new Error("Maaf, sesi baru saja ditutup.");

      const { data: user, error: userError } = await supabase
        .from("users")
        .insert([{ name: name.trim(), phone: phone.trim() }])
        .select().single();
      if (userError) throw userError;

      const { data: lastQueue } = await supabase
        .from("queues")
        .select("queue_number")
        .eq("session_id", latestSession.id)
        .order("queue_number", { ascending: false })
        .limit(1).maybeSingle();
      
      const nextQueueNumber = lastQueue ? lastQueue.queue_number + 1 : 1;

      const { data: queue, error: queueError } = await supabase
        .from("queues")
        .insert([{
          user_id: user.id,
          session_id: latestSession.id,
          queue_number: nextQueueNumber,
          status: "pending_confirmation",
          price: 0,
        }])
        .select().single();
      if (queueError) throw queueError;

      setQueueNumber(queue.queue_number);
      setTimeout(() => router.push(`/queue/${queue.id}`), 2500);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (!hasMounted) return <div className="min-h-screen bg-[#050505]" />;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-purple-500/30 overflow-x-hidden">
      {/* Background Glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <main className="relative z-10 container mx-auto px-6 py-6 min-h-screen flex flex-col">
        {/* Navbar */}
        <nav className="flex justify-between items-center mb-10 md:mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative">
              <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
            </div>
            <div className="hidden sm:block">
              <span className="font-black tracking-tighter text-xl uppercase italic block leading-none">
                Sayunk<span className="text-purple-500">.</span>
              </span>
              <span className="text-[8px] uppercase tracking-[0.3em] text-slate-500 font-bold">Photobooth</span>
            </div>
          </div>
          <button 
            onClick={() => {
              setIsAdminLogin(!isAdminLogin);
              setError("");
            }}
            className="text-[10px] font-black tracking-[0.2em] uppercase px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
          >
            {isAdminLogin ? "Mode User" : "Admin Login"}
          </button>
        </nav>

        <div className="flex-1 flex flex-col justify-center max-w-6xl mx-auto w-full">
          {currentStep === "home" ? (
            <HomePage 
              activeSession={activeSession} 
              checkingSession={checkingSession} 
              onStart={() => setCurrentStep("queue")} 
            />
          ) : (
            <QueueFormPage 
              isAdminLogin={isAdminLogin}
              loading={loading}
              error={error}
              name={name}
              setName={setName}
              phone={phone}
              setPhone={setPhone}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              handleSubmit={isAdminLogin ? handleAdminLogin : handleSubmit}
              queueNumber={queueNumber}
              onBack={() => {
                setCurrentStep("home");
                setIsAdminLogin(false);
                setError("");
              }}
              activeSession={activeSession}
            />
          )}
        </div>

        <footer className="mt-12 pt-8 border-t border-white/5 text-center">
          <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.4em]">
            Digital Queue System • Sayunk Studio 2026
          </p>
        </footer>
      </main>
    </div>
  );
}

// --- HOME PAGE COMPONENT ---
function HomePage({ activeSession, checkingSession, onStart }: any) {
  return (
    <div className="grid lg:grid-cols-2 gap-12 items-center animate-in fade-in slide-in-from-bottom-10 duration-1000">
      <div className="text-center lg:text-left">
        <h1 className="text-6xl md:text-7xl lg:text-8xl font-black leading-[0.85] tracking-tighter lowercase mb-8">
          capture <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-blue-400">every</span> <br />
          vibe.
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-md mx-auto lg:mx-0 mb-10 leading-relaxed font-medium">
          Self-studio photobooth dengan kualitas tinggi. Ambil antrianmu secara digital dan nikmati momen seru.
        </p>
        
        <button 
          onClick={onStart}
          disabled={!activeSession}
          className="group relative inline-flex items-center gap-4 px-10 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {activeSession ? "Ambil Antrian Sekarang" : "Sesi Belum Dibuka"}
          <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
          <div className="absolute -inset-1 bg-white/20 blur opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-colors" />
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-3">Status Studio</p>
          <h3 className="text-3xl font-black italic tracking-tighter">
            {checkingSession ? "Memeriksa..." : activeSession ? activeSession.title : "Tutup"}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${activeSession ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              {activeSession ? "Menerima Antrian" : "Tidak Ada Sesi Aktif"}
            </p>
          </div>
        </div>
        
        <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-white/20 transition-colors">
          <div className="text-2xl mb-2">⚡</div>
          <h4 className="font-black uppercase text-xs tracking-widest">Cepat</h4>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">Tanpa antri fisik, cukup lewat HP.</p>
        </div>
        <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-white/20 transition-colors">
          <div className="text-2xl mb-2">📸</div>
          <h4 className="font-black uppercase text-xs tracking-widest">Premium</h4>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">Kualitas studio profesional.</p>
        </div>
      </div>
    </div>
  );
}

// --- QUEUE FORM COMPONENT ---
function QueueFormPage({ 
  isAdminLogin, loading, error, name, setName, phone, setPhone, 
  email, setEmail, password, setPassword, handleSubmit, queueNumber, onBack, activeSession 
}: any) {
  
  if (queueNumber) {
    return (
      <div className="max-w-md mx-auto w-full animate-in zoom-in-95 duration-500">
        <div className="bg-[#0D0D10] border border-white/10 rounded-[3rem] p-10 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-600" />
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-green-500/50">
             <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
             </svg>
          </div>
          <h2 className="text-3xl font-black italic tracking-tighter mb-2 text-white">BERHASIL!</h2>
          <p className="text-slate-500 text-sm font-medium mb-8 uppercase tracking-widest">Nomor Antrian Kamu</p>
          
          <div className="bg-white/5 border border-white/5 rounded-[2rem] py-12 mb-8 group">
            <span className="text-9xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-600 block transition-transform group-hover:scale-110 duration-500">
              #{queueNumber}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 animate-pulse uppercase tracking-[0.3em] font-black">Mengarahkan ke tiket digital...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto w-full animate-in slide-in-from-bottom-10 duration-500">
      {/* Header Form & Tombol Kembali */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white">
            {isAdminLogin ? "Admin Login" : "Daftar Antrian"}
          </h2>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">
            {isAdminLogin ? "Akses Terbatas" : activeSession?.title || "Sesi Tertutup"}
          </p>
        </div>
        
        <button 
          onClick={onBack} 
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
        >
          <span>←</span> Kembali ke Beranda
        </button>
      </div>

      <div className="bg-[#0D0D10] border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
        {/* Dekorasi kartu */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/5 rounded-full blur-3xl" />
        
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          {isAdminLogin ? (
            <>
              <Input label="Email Admin" type="email" value={email} onChange={setEmail} placeholder="admin@sayunk.com" />
              <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
            </>
          ) : (
            <>
              <Input label="Nama Lengkap" type="text" value={name} onChange={setName} placeholder="Masukkan nama Anda..." />
              <Input label="Nomor WhatsApp" type="tel" value={phone} onChange={setPhone} placeholder="0812 3456 7890" />
              <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest leading-relaxed">
                  Informasi: Nomor antrian akan diberikan setelah Anda menekan tombol di bawah.
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="text-red-400 text-[10px] font-black uppercase tracking-widest p-4 bg-red-500/5 border border-red-500/20 rounded-xl animate-shake">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-slate-200 transition-all active:scale-[0.98] disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            {loading ? "Memproses..." : isAdminLogin ? "Masuk Admin" : "Konfirmasi & Ambil Tiket"}
          </button>
        </form>
      </div>

      {/* Footer bantuan */}
      <p className="text-center mt-8 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
        Butuh bantuan? Hubungi WhatsApp Admin di <span className="text-slate-400">0878-9371-0446</span>
      </p>
    </div>
  );
}

// --- HELPER COMPONENT ---
function Input({ label, type, value, onChange, placeholder }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">{label}</label>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4.5 text-white outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all placeholder:text-slate-700"
      />
    </div>
  );
}