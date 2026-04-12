"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

interface ActiveSession {
  id: string;
  title: string;
  status: "active" | "closed";
  started_at: string;
}

export default function QueuePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  const [checkingSession, setCheckingSession] = useState(true);

  const fetchActiveSession = async () => {
    setCheckingSession(true);

    const { data, error } = await supabase
      .from("queue_sessions")
      .select("id, title, status, started_at")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("fetchActiveSession error:", error.message);
      setActiveSession(null);
      setCheckingSession(false);
      return;
    }

    setActiveSession((data as ActiveSession | null) || null);
    setCheckingSession(false);
  };

  useEffect(() => {
    fetchActiveSession();

    const channel = supabase
      .channel("queue-page-session-listener")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_sessions" },
        () => {
          fetchActiveSession();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError("Login gagal! Periksa email dan password.");
      setLoading(false);
      return;
    }

    router.push("/admin");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !phone.trim()) {
      setError("Nama dan nomor HP harus diisi");
      return;
    }

    setLoading(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from("queue_sessions")
        .select("id, title")
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) throw sessionError;

      if (!sessionData) {
        throw new Error(
          "Sesi belum dimulai. Silakan tunggu admin membuka sesi.",
        );
      }

      const { data: user, error: userError } = await supabase
        .from("users")
        .insert([
          {
            name: name.trim(),
            phone: phone.trim(),
          },
        ])
        .select()
        .single();

      if (userError) throw userError;

      const { data: lastQueue, error: lastQueueError } = await supabase
        .from("queues")
        .select("queue_number")
        .eq("session_id", sessionData.id)
        .order("queue_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastQueueError) throw lastQueueError;

      const nextQueueNumber = lastQueue ? lastQueue.queue_number + 1 : 1;

      const { data: queue, error: queueError } = await supabase
        .from("queues")
        .insert([
          {
            user_id: user.id,
            session_id: sessionData.id,
            queue_number: nextQueueNumber,
            status: "pending_confirmation",
            price: 0,
          },
        ])
        .select()
        .single();

      if (queueError) throw queueError;

      setQueueNumber(queue.queue_number);

      setTimeout(() => {
        router.push(`/queue/${queue.id}`);
      }, 2500);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans overflow-x-hidden selection:bg-purple-500/30">
      <div className="relative min-h-screen flex flex-col lg:flex-row">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          <div
            className="w-full h-full"
            style={{
              backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="absolute -top-24 -left-24 w-80 h-80 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

        <section className="relative w-full lg:w-[52%] px-6 sm:px-10 lg:px-16 py-10 lg:py-14 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-12 h-12 sm:w-14 sm:h-14">
                <div className="absolute inset-0 rounded-2xl bg-white/15 blur-md" />
                <Image
                  src="/logo.png"
                  alt="Sayunk.Photobooth"
                  fill
                  sizes="44px"
                  className="object-contain"
                  priority
                />
              </div>

              <div>
                <p className="text-white text-lg sm:text-xl font-black tracking-tighter uppercase italic">
                  Sayunk<span className="text-purple-500">.</span>Photobooth
                </p>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-bold uppercase tracking-[0.28em] mt-1">
                  Digital Photo Experience
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setIsAdminLogin(!isAdminLogin);
                setError("");
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              {isAdminLogin ? "User Mode" : "Admin"}
            </button>
          </div>

          <div className="py-20 lg:py-20">
            <div className="max-w-2xl">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black leading-[0.88] tracking-tighter lowercase text-white">
                capture <br />
                <span className="text-transparent bg-clip-text bg-linear-to-r from-purple-400 via-fuchsia-400 to-blue-400">
                  moments
                </span>{" "}
                <br />
                instantly.
              </h1>

              <p className="mt-8 max-w-xl text-base sm:text-lg lg:text text-slate-400 font-medium leading-relaxed">
                Studio photobooth digital masa kini.
                <span className="text-white">
                  {" "}
                  Ambil nomor antrian secara instan
                </span>{" "}
                dan nikmati pengalaman yang cepat, rapi, dan modern.
              </p>

              <div className="mt-8 max-w-xl">
                {checkingSession ? (
                  <div className="rounded-4xl border border-white/10 bg-white/3 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-2">
                      Session Status
                    </p>
                    <p className="text-base font-black text-white">
                      Mengecek sesi aktif...
                    </p>
                  </div>
                ) : (
                  activeSession && (
                    <div className="rounded-4xl border border-green-500/20 bg-green-500/8 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-400 mb-2">
                        Sesi Aktif
                      </p>
                      <p className="text-xl font-black text-white tracking-tight">
                        {activeSession.title}
                      </p>
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                        Nomor antrian akan dimulai dari 1 untuk sesi ini.
                      </p>
                    </div>
                  )
                )}
              </div>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
                <InfoPill
                  title="Cepat"
                  desc="Ambil tiket dalam hitungan detik"
                />
                <InfoPill
                  title="Otomatis"
                  desc="Nomor antrian update real-time"
                />
                <InfoPill title="Praktis" desc="Tanpa ribet antri manual" />
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex items-center justify-between gap-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-600">
              Built for Sayunk Studio
            </p>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              2026
            </p>
          </div>
        </section>

        <section className="relative w-full lg:w-[48%] flex items-center justify-center px-6 sm:px-10 lg:px-16 py-10 lg:py-14 bg-[#09090B]">
          <div className="w-full max-w-md relative z-10">
            {queueNumber ? (
              <div className="relative animate-in zoom-in-95 duration-700">
                <div className="absolute -inset-1 rounded-4xl bg-linear-to-br from-purple-500/30 via-fuchsia-500/10 to-blue-500/30 blur-xl opacity-70" />
                <div className="relative rounded-4xl border border-white/10 bg-[#0E0E11]/95 backdrop-blur-xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                  <div className="p-10 text-center">
                    <div className="w-20 h-20 mx-auto bg-green-500/10 rounded-full flex items-center justify-center ring-1 ring-green-500/20 mb-6">
                      <svg
                        className="w-10 h-10 text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>

                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-green-400 mb-3">
                      Ticket Created
                    </p>
                    <h2 className="text-3xl font-black text-white italic tracking-tighter">
                      Antrian Berhasil
                    </h2>
                    <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                      Tiket digital Anda sedang disiapkan. Mohon tunggu
                      sebentar.
                    </p>

                    {activeSession && (
                      <div className="mt-5 rounded-2xl border border-white/8 bg-white/3 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-1">
                          Session
                        </p>
                        <p className="text-sm font-black text-white">
                          {activeSession.title}
                        </p>
                      </div>
                    )}

                    <div className="mt-8 rounded-4xl border border-white/10 bg-linear-to-b from-white/5 to-transparent p-8 relative overflow-hidden">
                      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-purple-500 via-fuchsia-500 to-blue-500 opacity-70" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        Queue Number
                      </p>
                      <div className="mt-4 text-8xl sm:text-9xl font-black italic leading-none tracking-tighter text-white drop-shadow-[0_10px_25px_rgba(255,255,255,0.08)]">
                        #{queueNumber}
                      </div>
                    </div>

                    <p className="mt-6 text-[11px] text-slate-500 font-bold uppercase tracking-[0.22em]">
                      Anda akan diarahkan ke halaman tiket
                    </p>
                  </div>

                  <div className="h-1.5 w-full bg-linear-to-r from-purple-600 via-fuchsia-500 to-blue-600" />
                </div>
              </div>
            ) : (
              <div className="relative animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="absolute -inset-1 rounded-4xl bg-linear-to-br from-purple-500/25 to-blue-500/25 blur-xl opacity-60" />
                <div className="relative rounded-4xl border border-white/10 bg-[#0D0D10]/95 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.42)] p-8 sm:p-10">
                  <div className="mb-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-5">
                      <span className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                        {isAdminLogin ? "Admin Access" : "Guest Ticket"}
                      </span>
                    </div>

                    <h2 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase italic leading-none text-white whitespace-pre-line">
                      {isAdminLogin ? "Admin\nLogin." : "Ambil Tiket."}
                    </h2>

                    <p className="mt-4 text-slate-500 text-base font-medium leading-relaxed">
                      {isAdminLogin
                        ? "Masuk untuk mengelola daftar antrian dan status pelanggan."
                        : activeSession
                          ? "Isi data singkat Anda lalu dapatkan tiket antrian secara instan."
                          : "Saat ini belum ada sesi aktif. Silakan tunggu admin membuka sesi."}
                    </p>
                  </div>

                  <form
                    onSubmit={isAdminLogin ? handleAdminLogin : handleSubmit}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      {isAdminLogin ? (
                        <>
                          <InputField
                            label="Admin Email"
                            type="email"
                            placeholder="admin@sayunk.com"
                            value={email}
                            onChange={setEmail}
                          />
                          <InputField
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={setPassword}
                          />
                        </>
                      ) : (
                        <>
                          <InputField
                            label="Full Name"
                            type="text"
                            placeholder="Masukkan nama anda"
                            value={name}
                            onChange={setName}
                          />
                          <InputField
                            label="WhatsApp Number"
                            type="tel"
                            placeholder="Masukkan nomor WhatsApp anda"
                            value={phone}
                            onChange={setPhone}
                          />
                        </>
                      )}
                    </div>

                    {error && (
                      <div className="flex items-start gap-3 rounded-2xl border border-red-500/15 bg-red-500/5 p-4 text-red-300">
                        <span className="text-base leading-none mt-0.5">⚠</span>
                        <p className="text-xs font-bold leading-relaxed">
                          {error}
                        </p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || (!isAdminLogin && !activeSession)}
                      className={`w-full rounded-2xl py-5 font-black uppercase tracking-[0.22em] transition-all duration-300 shadow-2xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                        isAdminLogin
                          ? "bg-white text-black hover:bg-slate-200 shadow-white/5"
                          : "bg-linear-to-r from-purple-600 via-fuchsia-500 to-blue-600 text-white hover:brightness-110 shadow-purple-600/30"
                      }`}
                    >
                      {loading
                        ? "Processing..."
                        : isAdminLogin
                          ? "Authenticate"
                          : activeSession
                            ? "Get My Ticket"
                            : "Session Not Active"}
                    </button>
                  </form>

                  {!isAdminLogin && (
                    <div className="mt-8 pt-8 border-t border-white/5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-600 text-center mb-5">
                        Connect With Us
                      </p>
                      <div className="flex items-center justify-center gap-4">
                        <SocialLink
                          href="https://instagram.com/sayunk_photobooth"
                          icon={<InstagramIcon />}
                        />
                        <SocialLink
                          href="https://wa.me/087893710446"
                          icon={<WhatsAppIcon />}
                        />
                        <SocialLink
                          href="https://tiktok.com/@sayunk_photobooth"
                          icon={<TikTokIcon />}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="border-t border-white/5 bg-black/70 px-6 py-6">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600">
            Built with precision for{" "}
            <span className="text-slate-300 italic">Sayunk Studio</span>
          </p>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            Copyright © 2026 <span className="text-purple-400">ryhnar25</span>.
            All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function InfoPill({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
      <p className="text-sm font-black text-white tracking-tight">{title}</p>
      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function InputField({
  label,
  type,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="group space-y-2.5">
      <label className="ml-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 group-focus-within:text-purple-400 transition-colors">
        {label}
      </label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/3 px-6 py-4 text-white font-semibold outline-none transition-all placeholder:text-slate-700 focus:border-purple-500/50 focus:bg-white/5"
      />
    </div>
  );
}

function SocialLink({ href, icon }: { href: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-white/3 text-slate-400 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-white/10 hover:text-white"
    >
      {icon}
    </a>
  );
}

const InstagramIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="ig-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f58529" />
        <stop offset="25%" stopColor="#dd2a7b" />
        <stop offset="50%" stopColor="#8134af" />
        <stop offset="75%" stopColor="#515bd4" />
        <stop offset="100%" stopColor="#feda77" />
      </linearGradient>
    </defs>

    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="5"
      stroke="url(#ig-gradient)"
      strokeWidth="2"
    />
    <circle cx="12" cy="12" r="4" stroke="url(#ig-gradient)" strokeWidth="2" />
    <circle cx="17" cy="7" r="1.2" fill="url(#ig-gradient)" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg
    className="w-5 h-5 text-green-400"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M20.52 3.48A11.94 11.94 0 0012.06 0C5.46 0 .1 5.36.1 11.96c0 2.1.55 4.15 1.6 5.96L0 24l6.23-1.63a11.9 11.9 0 005.83 1.49h.01c6.6 0 11.96-5.36 11.96-11.96 0-3.2-1.25-6.2-3.5-8.42zM12.06 21.5c-1.8 0-3.56-.48-5.1-1.4l-.36-.21-3.7.97.99-3.6-.24-.37a9.46 9.46 0 01-1.45-5.03c0-5.22 4.24-9.46 9.46-9.46 2.53 0 4.9.99 6.68 2.77a9.43 9.43 0 012.78 6.7c0 5.22-4.24 9.46-9.46 9.46zm5.16-7.04c-.28-.14-1.65-.82-1.9-.91-.25-.09-.43-.14-.61.14-.18.28-.7.91-.86 1.1-.16.18-.32.2-.6.07-.28-.14-1.2-.44-2.28-1.4-.84-.75-1.4-1.67-1.57-1.95-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47l-.52-.01c-.18 0-.46.07-.7.34-.24.28-.92.9-.92 2.2 0 1.3.94 2.55 1.07 2.73.14.18 1.86 2.84 4.51 3.99.63.27 1.13.43 1.52.55.64.2 1.23.17 1.7.1.52-.08 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.52-.32z" />
  </svg>
);

const TikTokIcon = () => (
  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 15 24">
    <path d="M12.5 2c.4 3.2 2.6 5.2 5.7 5.4v3.1c-1.7 0-3.3-.5-4.7-1.4v5.5c0 4.5-3.7 8.2-8.2 8.2S-3 19.1-3 14.6 0.7 6.4 5.2 6.4c.4 0 .8 0 1.2.1v3.3c-.4-.1-.8-.2-1.2-.2-2.7 0-4.9 2.2-4.9 4.9s2.2 4.9 4.9 4.9 4.9-2.2 4.9-4.9V2h3.4z" />
  </svg>
);
