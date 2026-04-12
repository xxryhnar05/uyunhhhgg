"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Queue {
  id: string;
  queue_number: number;
  status: string;
  users?:
    | Array<{
        name: string;
      }>
    | {
        name: string;
      };
}

export default function QueuePage() {
  const { id } = useParams();
  const queueId = Array.isArray(id) ? id[0] : id;

  const [queue, setQueue] = useState<Queue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchQueueData = async () => {
    try {
      const { data, error } = await supabase
        .from("queues")
        .select("id, queue_number, status, users(name)")
        .eq("id", queueId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          setQueue(null);
          console.error("Queue tidak ditemukan.");
        } else {
          console.error("Fetch error:", error);
        }
        setIsLoading(false);
        return;
      }

      setQueue(data);
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching queue data:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!queueId) return;

    fetchQueueData();

    pollIntervalRef.current = setInterval(() => {
      const fetchForPolling = async () => {
        try {
          const { data, error } = await supabase
            .from("queues")
            .select("id, queue_number, status, users(name)")
            .eq("id", queueId)
            .single();

          if (!error && data) {
            setQueue(data);
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      fetchForPolling();
    }, 2000);

    const channel = supabase
      .channel(`queue-${queueId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "queues",
          filter: `id=eq.${queueId}`,
        },
        (payload) => {
          setQueue((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              status: payload.new.status,
              queue_number: payload.new.queue_number,
            };
          });
        },
      )
      .subscribe();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      channel.unsubscribe();
    };
  }, [queueId]);

  const getStatusMeta = (status?: string) => {
    switch (status) {
      case "pending_confirmation":
        return {
          label: "Menunggu Konfirmasi",
          shortLabel: "Pending",
          colorText: "text-orange-400",
          colorDot: "bg-orange-400",
          colorBadge:
            "bg-orange-500/10 text-orange-300 border border-orange-500/20",
          glow: "shadow-[0_0_12px_rgba(251,146,60,0.35)]",
          messageTitle: "Admin sedang memverifikasi data Anda",
          messageDesc: "Mohon tunggu sebentar. Status akan berubah otomatis.",
        };
      case "menunggu":
        return {
          label: "Menunggu Giliran",
          shortLabel: "Waiting",
          colorText: "text-purple-300",
          colorDot: "bg-purple-400",
          colorBadge:
            "bg-purple-500/10 text-purple-200 border border-purple-500/20",
          glow: "shadow-[0_0_12px_rgba(168,85,247,0.35)]",
          messageTitle: "Giliran Anda belum dipanggil",
          messageDesc: "Silakan tetap standby. Kami akan memanggil Anda segera.",
        };
      case "silahkan masuk":
        return {
          label: "Silakan Masuk",
          shortLabel: "Masuk",
          colorText: "text-blue-300",
          colorDot: "bg-blue-400",
          colorBadge: "bg-blue-500/10 text-blue-200 border border-blue-500/20",
          glow: "shadow-[0_0_12px_rgba(96,165,250,0.35)]",
          messageTitle: "Sekarang giliran Anda",
          messageDesc: "Silakan menuju studio dan bersiap untuk sesi foto.",
        };
      case "sedang foto":
        return {
          label: "Sedang Foto",
          shortLabel: "In Session",
          colorText: "text-yellow-300",
          colorDot: "bg-yellow-400",
          colorBadge:
            "bg-yellow-500/10 text-yellow-200 border border-yellow-500/20",
          glow: "shadow-[0_0_12px_rgba(250,204,21,0.35)]",
          messageTitle: "Sesi foto sedang berlangsung",
          messageDesc: "Nikmati momen Anda. Hasil akan segera diproses.",
        };
      case "selesai":
        return {
          label: "Selesai",
          shortLabel: "Done",
          colorText: "text-green-300",
          colorDot: "bg-green-400",
          colorBadge:
            "bg-green-500/10 text-green-200 border border-green-500/20",
          glow: "shadow-[0_0_12px_rgba(74,222,128,0.35)]",
          messageTitle: "Sesi selesai. Terima kasih!",
          messageDesc: "Terima kasih sudah berkunjung ke Sayunk Photobooth.",
        };
      default:
        return {
          label: "Menunggu",
          shortLabel: "Waiting",
          colorText: "text-gray-300",
          colorDot: "bg-gray-400",
          colorBadge: "bg-white/5 text-gray-200 border border-white/10",
          glow: "",
          messageTitle: "Mohon tunggu giliran Anda",
          messageDesc: "Status tiket Anda akan diperbarui secara otomatis.",
        };
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-slate-500">
            Loading Ticket
          </p>
        </div>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="min-h-screen bg-[#050505] text-white font-sans flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-72 h-72 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-2 mb-8 opacity-70">
            <span className="text-xs font-black tracking-[0.35em] uppercase italic text-slate-300">
              Sayunk Photobooth
            </span>
          </div>

          <div className="relative group animate-in zoom-in-95 duration-700">
            <div className="absolute -inset-1 bg-linear-to-b from-red-500/40 to-orange-500/40 rounded-[3rem] blur-xl opacity-40" />

            <div className="relative bg-[#0F0F0F]/95 backdrop-blur-xl rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl">
              <div className="p-10 text-center space-y-6">
                <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center ring-1 ring-red-500/20">
                  <svg
                    className="w-8 h-8 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>

                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-black tracking-tighter">
                    Tiket Tidak Ditemukan
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Tiket antrian Anda sudah tidak tersedia.
                    <br />
                    Silakan ambil nomor antrian baru.
                  </p>
                </div>

                <a
                  href="/queue"
                  className="inline-flex items-center justify-center px-8 py-3 bg-linear-to-r from-purple-600 to-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all"
                >
                  Ambil Antrian Baru
                </a>
              </div>

              <div className="bg-linear-to-r from-red-500 via-orange-500 to-red-500 h-1.5 w-full" />
            </div>
          </div>

          <div className="mt-10 text-center space-y-2">
            <p className="text-gray-600 text-[9px] font-black uppercase tracking-[0.35em]">
              Sayunk Photobooth
            </p>
            <div className="h-1 w-8 bg-gray-800 mx-auto rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  const userName = Array.isArray(queue.users)
    ? queue.users[0]?.name
    : queue.users?.name;

  const statusMeta = getStatusMeta(queue.status);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="absolute top-[-10%] left-[-10%] w-80 h-80 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="flex items-center justify-center mb-8">
          <span className="text-[11px] font-black tracking-[0.38em] uppercase italic text-slate-300/80">
            Sayunk Photobooth
          </span>
        </div>

        <div className="relative group animate-in zoom-in-95 duration-700">
          <div className="absolute -inset-1 bg-linear-to-b from-purple-500/35 via-fuchsia-500/20 to-blue-500/35 rounded-[3rem] blur-xl opacity-50 transition-all duration-500 group-hover:opacity-70" />

          <div className="relative bg-[#0B0B0D]/95 backdrop-blur-xl rounded-[3rem] border border-white/10 overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-x-0 top-0 h-px bg-white/10" />

            <div className="p-8 pb-6 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-5">
                <span className={`w-2 h-2 rounded-full ${statusMeta.colorDot} ${statusMeta.glow}`} />
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-300">
                  Live Ticket
                </span>
              </div>

              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.45em] mb-5">
                Antrian Anda
              </p>

              <div className="relative">
                <div className="absolute inset-0 blur-3xl opacity-20 bg-white rounded-full" />
                <h1 className="relative text-[112px] font-black italic leading-none tracking-tighter bg-clip-text text-transparent bg-linear-to-b from-white via-slate-100 to-slate-500 drop-shadow-[0_10px_30px_rgba(255,255,255,0.08)]">
                  #{queue.queue_number}
                </h1>
              </div>
            </div>

            <div className="px-6">
              <div className="relative flex items-center">
                <div className="absolute -left-9 w-8 h-8 rounded-full bg-[#050505] border border-white/10" />
                <div className="flex-1 border-t border-dashed border-white/10" />
                <div className="absolute -right-9 w-8 h-8 rounded-full bg-[#050505] border border-white/10" />
              </div>
            </div>

            <div className="p-8 pt-7 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/3 border border-white/5 p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.22em] mb-2">
                    Customer
                  </p>
                  <p className="text-base font-black text-white tracking-tight truncate">
                    {userName || "Guest User"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/3 border border-white/5 p-4 text-right">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.22em] mb-2">
                    Status
                  </p>
                  <div className="flex justify-end">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.16em] ${statusMeta.colorBadge}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${statusMeta.colorDot}`} />
                      {statusMeta.shortLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-4x1 bg-linear-to-br from-white/6 to-white/2 border border-white/8 p-6 text-center shadow-inner">
                <p className={`text-sm font-black italic uppercase tracking-tight ${statusMeta.colorText}`}>
                  {statusMeta.messageTitle}
                </p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {statusMeta.messageDesc}
                </p>
              </div>

              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
                  Tiket ini akan update otomatis
                </p>
              </div>
            </div>

            <div className="h-1.5 w-full bg-linear-to-r from-purple-600 via-pink-500 to-blue-500" />
          </div>
        </div>

        <div className="mt-10 text-center space-y-2">
          <p className="text-gray-600 text-[9px] font-black uppercase tracking-[0.35em]">
            Sayunk Photobooth
          </p>
          <div className="h-1 w-8 bg-gray-800 mx-auto rounded-full" />
        </div>
      </div>
    </div>
  );
}