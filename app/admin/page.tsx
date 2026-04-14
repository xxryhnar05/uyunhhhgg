"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { playNotificationSound } from "@/lib/audioNotification";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
// @ts-ignore
import { saveAs } from "file-saver";

interface QueueUser {
  name: string;
  phone: string;
}

interface Queue {
  id: string;
  queue_number: number;
  status: string;
  price: number;
  created_at: string;
  session_id?: string | null;
  users: QueueUser[] | QueueUser | null;
}

interface WhatsAppData {
  phone: string;
  name: string;
  queueNumber: number;
}

interface QueueSession {
  id: string;
  title: string;
  status: "active" | "closed";
  started_at: string;
  ended_at?: string | null;
  created_at?: string;
}

export default function AdminPage() {
  const router = useRouter();

  const [queues, setQueues] = useState<Queue[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("antrian");
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [thisMonthRevenue, setThisMonthRevenue] = useState(0);
  const [dailyData, setDailyData] = useState<any[]>([]);

  const [activeSession, setActiveSession] = useState<QueueSession | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionLoading, setSessionLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [inputPrice, setInputPrice] = useState("");

  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppData, setWhatsAppData] = useState<WhatsAppData | null>(null);

  const [sessionHistory, setSessionHistory] = useState<QueueSession[]>([]);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<any>(null);
  const [isSessionDetailOpen, setIsSessionDetailOpen] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getMonthStartJakarta = () => {
    const now = new Date();
    const jakarta = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
    );

    const year = jakarta.getFullYear();
    const month = String(jakarta.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}-01`;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    });
  };

  const getUserName = (users: Queue["users"]) => {
    if (!users) return "Guest";
    return Array.isArray(users) ? users[0]?.name || "Guest" : users.name;
  };

  const getUserPhone = (users: Queue["users"]) => {
    if (!users) return "";
    return Array.isArray(users) ? users[0]?.phone || "" : users.phone;
  };

  const logout = async () => {
    const confirmLogout = confirm("Apakah Anda yakin ingin logout?");
    if (!confirmLogout) return;

    await supabase.auth.signOut();
    router.push("/");
  };

  const fetchActiveSession = async () => {
    const { data, error } = await supabase
      .from("queue_sessions")
      .select("*")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("fetchActiveSession error:", error.message);
      return null;
    }

    const session = (data as QueueSession | null) || null;
    setActiveSession(session);
    return session;
  };

  const fetchQueues = async (sessionId?: string | null) => {
    if (!sessionId) {
      setQueues([]);
      return;
    }

    const { data, error } = await supabase
      .from("queues")
      .select(
        "id, queue_number, status, price, created_at, session_id, users(name, phone)",
      )
      .eq("session_id", sessionId)
      .order("queue_number", { ascending: true });

    if (error) {
      console.error("fetchQueues error:", error.message);
      return;
    }

    setQueues((data as Queue[]) || []);
  };

  const fetchTodayRevenue = async (sessionId?: string | null) => {
    if (!sessionId) {
      setTodayRevenue(0);
      return;
    }

    const { data, error } = await supabase
      .from("queues")
      .select("price")
      .eq("session_id", sessionId)
      .eq("status", "selesai");

    if (error) {
      console.error("fetchTodayRevenue error:", error.message);
      return;
    }

    const total = data?.reduce((sum, q: any) => sum + (q.price || 0), 0) || 0;
    setTodayRevenue(total);
  };

  const fetchThisMonthRevenue = async () => {
    const monthStart = getMonthStartJakarta();

    const { data, error } = await supabase
      .from("queues")
      .select("price, created_at")
      .gte("created_at", `${monthStart}T00:00:00`)
      .eq("status", "selesai");

    if (error) {
      console.error("fetchThisMonthRevenue error:", error.message);
      return;
    }

    const total =
      data?.reduce((sum: number, q: any) => sum + (q.price || 0), 0) || 0;
    setThisMonthRevenue(total);
  };

  const fetchDailyChart = async () => {
    const monthStart = getMonthStartJakarta();

    const { data, error } = await supabase
      .from("queues")
      .select("created_at, price, status")
      .gte("created_at", `${monthStart}T00:00:00`)
      .eq("status", "selesai");

    if (error) {
      console.error("fetchDailyChart error:", error.message);
      return;
    }

    const grouped: Record<string, number> = {};

    data.forEach((item: any) => {
      const date = new Date(item.created_at).toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta",
      });
      if (!grouped[date]) grouped[date] = 0;
      grouped[date] += item.price || 0;
    });

    const chartData = Object.keys(grouped).map((date) => ({
      date,
      total: grouped[date],
    }));

    setDailyData(chartData);
  };

  const refreshPageData = async () => {
    const session = await fetchActiveSession();
    await fetchQueues(session?.id || null);
    await fetchTodayRevenue(session?.id || null);
    await fetchThisMonthRevenue();
    await fetchDailyChart();
    await fetchSessionHistory();
  };

  useEffect(() => {
    let mounted = true;
    let subscription: any = null;

    const setupAuthListener = async () => {
      try {
        console.log("Admin page: Checking authentication...");

        // First, check current session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) {
          console.log("Admin page: Component unmounted, skipping");
          return;
        }

        console.log("Admin page: Session check result:", {
          session: session?.user?.email,
          error: sessionError,
        });

        if (sessionError) {
          console.error("Admin page: Session check error:", sessionError);
          try {
            await router.push("/queue");
          } catch (err) {
            console.error("Admin page: Navigation error", err);
            window.location.href = "/queue";
          }
          return;
        }

        if (!session) {
          console.log(
            "Admin page: No session found in first check, waiting 500ms...",
          );
          // Wait a bit for session to be established
          await new Promise((resolve) => setTimeout(resolve, 500));

          const {
            data: { session: session2 },
            error: error2,
          } = await supabase.auth.getSession();
          console.log("Admin page: Second session check result:", {
            session: session2?.user?.email,
            error: error2,
          });

          if (!session2) {
            console.log(
              "Admin page: Still no session after wait, redirecting to login",
            );
            try {
              await router.push("/queue");
            } catch (err) {
              console.error("Admin page: Navigation error", err);
              window.location.href = "/queue";
            }
            return;
          }
        }

        // Session exists or was established, load data
        if (mounted) {
          console.log("Admin page: Session confirmed, loading data...");
          await refreshPageData();

          pollIntervalRef.current = setInterval(async () => {
            await refreshPageData();
          }, 2000);

          const channel = supabase
            .channel("queues-admin-and-sessions")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "queues" },
              () => {
                refreshPageData();
              },
            )
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "queue_sessions" },
              () => {
                refreshPageData();
              },
            )
            .subscribe();

          subscription = channel;
          console.log("Admin page: Setup complete");
        }
      } catch (error: any) {
        console.error("Admin page: Error checking auth:", error);
        if (mounted) {
          try {
            await router.push("/queue");
          } catch (err) {
            console.error("Admin page: Navigation error in catch", err);
            window.location.href = "/queue";
          }
        }
      }
    };

    setupAuthListener();

    return () => {
      console.log("Admin page: Cleanup called");
      mounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (subscription) supabase.removeChannel(subscription);
    };
  }, [router]);

  const startSession = async () => {
    if (!sessionTitle.trim()) {
      alert("Nama sesi wajib diisi.");
      return;
    }

    setSessionLoading(true);

    try {
      const { data: existing, error: existingError } = await supabase
        .from("queue_sessions")
        .select("id")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        throw new Error("Masih ada sesi aktif. Selesaikan dulu sesi berjalan.");
      }

      const { error } = await supabase.from("queue_sessions").insert([
        {
          title: sessionTitle.trim(),
          status: "active",
        },
      ]);

      if (error) throw error;

      setSessionTitle("");
      await refreshPageData();
      alert("✅ Sesi kerja berhasil dimulai.");
    } catch (err: any) {
      alert(`❌ Gagal memulai sesi: ${err.message}`);
    } finally {
      setSessionLoading(false);
    }
  };

  const endSession = async () => {
    if (!activeSession) return;

    const confirmEnd = confirm(
      `Selesaikan sesi "${activeSession.title}"?\n\nAntrian sesi ini akan ditutup dan sesi berikutnya nanti mulai lagi dari nomor 1.`,
    );
    if (!confirmEnd) return;

    setSessionLoading(true);

    try {
      const { error } = await supabase
        .from("queue_sessions")
        .update({
          status: "closed",
          ended_at: new Date().toISOString(),
        })
        .eq("id", activeSession.id);

      if (error) throw error;

      await refreshPageData();
      alert("✅ Sesi berhasil diselesaikan.");
    } catch (err: any) {
      alert(`❌ Gagal menyelesaikan sesi: ${err.message}`);
    } finally {
      setSessionLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string, price?: number) => {
    setLoadingId(id);

    try {
      const payload: any = { status };
      if (price !== undefined) payload.price = price;

      const { error } = await supabase
        .from("queues")
        .update(payload)
        .eq("id", id);

      if (error) throw error;

      if (status === "silahkan masuk") {
        playNotificationSound();
      }

      await refreshPageData();
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const deleteQueue = async (id: string) => {
    const confirmDelete = confirm("Apakah Anda yakin ingin hapus antrian ini?");
    if (!confirmDelete) return;

    setLoadingId(id);

    try {
      const { error } = await supabase.from("queues").delete().eq("id", id);
      if (error) throw error;

      await refreshPageData();
      alert("✅ Antrian berhasil dihapus");
    } catch (err: any) {
      alert(`Gagal hapus: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const getByStatus = (status: string) =>
    queues.filter((q) => q.status === status);

  const getWaiting = () =>
    queues.filter(
      (q) =>
        ![
          "silahkan masuk",
          "sedang foto",
          "selesai",
          "pending_confirmation",
        ].includes(q.status),
    );

  const fetchSessionHistory = async () => {
    const { data, error } = await supabase
      .from("queue_sessions")
      .select("*")
      .eq("status", "closed")
      .order("started_at", { ascending: false });

    if (error) {
      console.error("fetchSessionHistory error:", error.message);
      return;
    }

    setSessionHistory((data as QueueSession[]) || []);
  };

  const getSessionDetails = async (sessionId: string) => {
    try {
      const session = sessionHistory.find((s) => s.id === sessionId);
      if (!session) return;

      const { data: queuesData, error: queuesError } = await supabase
        .from("queues")
        .select("id, status, price")
        .eq("session_id", sessionId);

      if (queuesError) throw queuesError;

      const totalQueues = queuesData?.length || 0;
      const completedQueues =
        queuesData?.filter((q) => q.status === "selesai").length || 0;
      const totalRevenue =
        queuesData?.reduce((sum: number, q: any) => sum + (q.price || 0), 0) ||
        0;

      setSelectedSessionDetail({
        ...session,
        totalQueues,
        completedQueues,
        totalRevenue,
      });
      setIsSessionDetailOpen(true);
    } catch (err: any) {
      console.error("getSessionDetails error:", err.message);
    }
  };

  const exportToExcel = () => {
    const dataExport = queues
      .filter((q) => q.status === "selesai")
      .map((q) => ({
        Sesi: activeSession?.title || "-",
        Nama: getUserName(q.users),
        Nomor_Antrian: q.queue_number,
        Harga: q.price,
        Tanggal: new Date(q.created_at).toLocaleDateString("id-ID", {
          timeZone: "Asia/Jakarta",
        }),
      }));

    const worksheet = XLSX.utils.json_to_sheet(dataExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const file = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(file, "laporan-photobox.xlsx");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-purple-500 overflow-x-hidden">
      <div className="absolute inset-0 opacity-[0.025] pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
      </div>

      <div className="flex min-h-screen flex-col md:flex-row relative">
        <aside className="w-full md:w-72 bg-[#09090B]/95 backdrop-blur-xl border-r border-white/5 flex flex-col md:sticky md:top-0 md:h-screen z-40">
          <div className="flex flex-col h-full justify-between">
            <div className="p-7">
              <div className="flex items-center gap-4 mb-10">
                <div className="relative p-1.5 bg-white/5 border border-white/10 rounded-2xl shadow-lg">
                  <div className="relative w-11 h-11 overflow-hidden">
                    <Image
                      src="/logo.png"
                      alt="Sayunk.Photobooth"
                      fill
                      sizes="44px"
                      className="object-contain"
                      priority
                    />
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="font-black tracking-tighter uppercase italic text-sm text-white leading-none">
                    Sayunk
                  </span>
                  <span className="font-bold tracking-[0.22em] uppercase text-[8px] text-purple-400 mt-1">
                    Photobooth
                  </span>
                </div>
              </div>

              <nav className="space-y-2">
                <SidebarTab
                  label="Management"
                  active={activeTab === "antrian"}
                  onClick={() => setActiveTab("antrian")}
                />
                <SidebarTab
                  label="Revenue"
                  active={activeTab === "pendapatan"}
                  onClick={() => setActiveTab("pendapatan")}
                />
                <SidebarTab
                  label="Session History"
                  active={activeTab === "history"}
                  onClick={() => setActiveTab("history")}
                />
                <SidebarTab
                  label="Crazy Spirit"
                  active={activeTab === "crazy_spirit"}
                  onClick={() => setActiveTab("crazy_spirit")}
                />
              </nav>
            </div>

            <div className="p-6 border-t border-white/5 bg-white/2">
              <div className="rounded-3xl border border-white/8 bg-linear-to-br from-green-500/10 to-emerald-500/5 p-4 mb-4">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.24em] mb-2">
                  This Month
                </p>
                <p className="text-xl font-black text-green-400 leading-none tracking-tighter">
                  Rp {thisMonthRevenue.toLocaleString("id-ID")}
                </p>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-3 border border-red-500/25 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.22em] transition-all active:scale-95"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 overflow-x-hidden relative">
          <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-xl">
            <div className="px-6 md:px-10 py-6 max-w-400 mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">
                  Admin Dashboard
                </p>
                <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic">
                  {activeTab === "antrian"
                    ? "Session Control"
                    : activeTab === "pendapatan"
                      ? "Financial Report"
                      : activeTab === "history"
                        ? "Session History"
                        : "Crazy Spirit Gallery"}
                </h1>
              </div>

              <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeSession ? "bg-green-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.22em]">
                  {activeSession ? "Session Active" : "No Active Session"}
                </span>
              </div>
            </div>
          </header>

          <main className="p-6 md:p-10 max-w-400 mx-auto">
            {activeTab === "antrian" ? (
              <>
                {/* SESSION CONTROL */}
                <div className="mb-8 grid grid-cols-1 xl:grid-cols-12 gap-6">
                  {!activeSession ? (
                    <>
                      {/* LEFT - INFO */}
                      <div className="xl:col-span-7 rounded-4x1 border border-white/8 bg-white/3 p-8 md:p-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-3">
                          Session Setup
                        </p>

                        <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter text-white mb-4">
                          Belum Ada Sesi Aktif
                        </h2>

                        <p className="text-slate-500 text-sm max-w-md leading-relaxed">
                          Buat sesi baru untuk memulai antrian dari nomor 1.
                          Semua data sebelumnya tetap aman.
                        </p>

                        <div className="mt-6">
                          <input
                            type="text"
                            placeholder="Contoh: Pernikahan Desa Makmur"
                            value={sessionTitle}
                            onChange={(e) => setSessionTitle(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-white/3 px-6 py-4 text-white font-semibold outline-none placeholder:text-slate-700 focus:border-purple-500/50 focus:bg-white/5"
                          />
                        </div>
                      </div>

                      {/* RIGHT - ACTION */}
                      <div className="xl:col-span-5 flex items-center">
                        <button
                          onClick={startSession}
                          disabled={sessionLoading}
                          className="w-full h-full min-h-30 rounded-4x1 bg-linear-to-r from-purple-600 to-blue-600 hover:brightness-110 text-white font-black text-sm uppercase tracking-[0.22em] transition-all shadow-xl shadow-purple-900/30 disabled:opacity-50"
                        >
                          {sessionLoading ? "Processing..." : "Mulai Kerja"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* LEFT - INFO SESSION */}
                      <div className="xl:col-span-7 rounded-4x1 border border-white/8 bg-white/3 p-8 md:p-10">
                        <div className="flex items-center gap-3 mb-5">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-green-400">
                            Active Session
                          </p>
                        </div>

                        <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter text-white mb-6">
                          {activeSession.title}
                        </h2>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <SessionInfo
                            label="Status"
                            value={activeSession.status.toUpperCase()}
                          />
                          <SessionInfo
                            label="Mulai"
                            value={formatDateTime(activeSession.started_at)}
                          />
                          <SessionInfo
                            label="Antrian"
                            value={`${queues.length} orang`}
                          />
                        </div>
                      </div>

                      {/* RIGHT - ACTION */}
                      <div className="xl:col-span-5 flex items-center">
                        <button
                          onClick={endSession}
                          disabled={sessionLoading}
                          className="w-full h-full min-h-30 rounded-4x1 border border-red-500/25 bg-red-500/10 hover:bg-red-500 text-red-300 hover:text-white font-black text-sm uppercase tracking-[0.22em] transition-all disabled:opacity-50"
                        >
                          {sessionLoading ? "Processing..." : "Selesaikan Sesi"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* STATS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <StatCard
                    title="Done Today"
                    value={getByStatus("selesai").length}
                    tone="green"
                  />
                  <StatCard
                    title="Revenue Today"
                    value={`Rp ${todayRevenue.toLocaleString("id-ID")}`}
                    tone="emerald"
                  />
                  <StatCard
                    title="Revenue Month"
                    value={`Rp ${thisMonthRevenue.toLocaleString("id-ID")}`}
                    tone="sky"
                  />
                </div>

                {!activeSession ? (
                  <div className="rounded-4x1 border border-white/8 bg-white/3 p-10 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
                      Queue Locked
                    </p>
                    <h3 className="text-3xl font-black italic tracking-tighter text-white mb-3">
                      Belum Ada Sesi Aktif
                    </h3>
                    <p className="text-slate-500 max-w-xl mx-auto">
                      Mulai sesi kerja terlebih dahulu agar antrian bisa tampil
                      dan nomor antrian baru bisa dibuat dari nomor 1.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                    <Column
                      title="Pending Confirmation"
                      count={getByStatus("pending_confirmation").length}
                      color="orange"
                    >
                      {getByStatus("pending_confirmation").map((q) => (
                        <QueueCard
                          key={q.id}
                          q={q}
                          onAction={() => updateStatus(q.id, "menunggu")}
                          label="Confirm"
                          color="orange"
                          onDelete={deleteQueue}
                          setWhatsAppData={setWhatsAppData}
                          setIsWhatsAppModalOpen={setIsWhatsAppModalOpen}
                          loadingId={loadingId}
                        />
                      ))}
                    </Column>

                    <Column
                      title="Waiting List"
                      count={getWaiting().length}
                      color="gray"
                    >
                      {getWaiting().map((q) => (
                        <QueueCard
                          key={q.id}
                          q={q}
                          onAction={() => updateStatus(q.id, "silahkan masuk")}
                          label="Call Guest"
                          color="purple"
                          onDelete={deleteQueue}
                          setWhatsAppData={setWhatsAppData}
                          setIsWhatsAppModalOpen={setIsWhatsAppModalOpen}
                          loadingId={loadingId}
                        />
                      ))}
                    </Column>

                    <Column
                      title="In Studio"
                      count={
                        getByStatus("silahkan masuk").length +
                        getByStatus("sedang foto").length
                      }
                      color="blue"
                    >
                      {[
                        ...getByStatus("silahkan masuk"),
                        ...getByStatus("sedang foto"),
                      ].map((q) => (
                        <QueueCard
                          key={q.id}
                          q={q}
                          onAction={() => {
                            if (q.status === "silahkan masuk") {
                              updateStatus(q.id, "sedang foto");
                            } else {
                              setSelectedQueue(q);
                              setIsModalOpen(true);
                            }
                          }}
                          label={
                            q.status === "silahkan masuk"
                              ? "Start Pose"
                              : "Complete"
                          }
                          color={q.status === "sedang foto" ? "yellow" : "blue"}
                          onDelete={deleteQueue}
                          setWhatsAppData={setWhatsAppData}
                          setIsWhatsAppModalOpen={setIsWhatsAppModalOpen}
                          loadingId={loadingId}
                        />
                      ))}
                    </Column>

                    <Column
                      title="Logs Today"
                      count={getByStatus("selesai").length}
                      color="green"
                    >
                      <div className="h-65 overflow-y-auto pr-2 space-y-3">
                        {getByStatus("selesai")
                          .slice()
                          .reverse()
                          .map((q) => (
                            <QueueCard
                              key={q.id}
                              q={q}
                              color="green"
                              onDelete={deleteQueue}
                              setWhatsAppData={setWhatsAppData}
                              setIsWhatsAppModalOpen={setIsWhatsAppModalOpen}
                              loadingId={loadingId}
                              compact
                            />
                          ))}
                      </div>
                    </Column>
                  </div>
                )}
              </>
            ) : activeTab === "pendapatan" ? (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  <div className="xl:col-span-4 rounded-4xl border border-white/8 bg-linear-to-br from-green-500/15 to-green-500/5 p-8 md:p-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
                      Revenue Today
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white leading-none">
                      Rp {todayRevenue.toLocaleString("id-ID")}
                    </h2>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Pendapatan sesi aktif
                    </p>
                  </div>

                  <div className="xl:col-span-4 rounded-4xl border border-white/8 bg-linear-to-br from-sky-500/15 to-sky-500/5 p-8 md:p-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
                      Revenue Month
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white leading-none">
                      Rp {thisMonthRevenue.toLocaleString("id-ID")}
                    </h2>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Pendapatan bulan ini
                    </p>
                  </div>

                  <div className="xl:col-span-4 rounded-4xl border border-white/10 bg-linear-to-br from-purple-600/20 to-blue-600/20 p-8 md:p-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
                      Active Session
                    </p>
                    <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white leading-tight">
                      {activeSession?.title || "Tidak ada sesi aktif"}
                    </h2>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      Session title
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  <div className="xl:col-span-8 rounded-4xl border border-white/8 bg-white/3 p-8 md:p-10">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">
                          Performance Chart
                        </p>
                        <h3 className="text-2xl font-black italic tracking-tighter text-white">
                          Financial Report
                        </h3>
                      </div>

                      <button
                        onClick={exportToExcel}
                        className="px-6 py-3 rounded-2xl border border-green-500/25 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white text-[10px] font-black uppercase tracking-[0.24em] transition-all"
                      >
                        Export XLSX
                      </button>
                    </div>

                    <div className="rounded-4xl border border-white/6 bg-black/20 p-4 md:p-6">
                      <div className="h-90">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={dailyData}>
                            <XAxis
                              dataKey="date"
                              stroke="#3f3f46"
                              fontSize={10}
                            />
                            <YAxis stroke="#3f3f46" fontSize={10} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#0A0A0A",
                                border: "1px solid #222",
                                borderRadius: "16px",
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="total"
                              stroke="#9333ea"
                              strokeWidth={4}
                              dot={{ fill: "#9333ea", r: 4 }}
                              activeDot={{ r: 8 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="xl:col-span-4 rounded-4xl border border-white/8 bg-white/3 p-8">
                    <div className="mb-6">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">
                        Latest Payments
                      </p>
                      <h3 className="text-2xl font-black italic tracking-tighter text-white">
                        Recent Transactions
                      </h3>
                    </div>

                    <div className="space-y-3 max-h-90 overflow-y-auto pr-2">
                      {getByStatus("selesai")
                        .slice()
                        .reverse()
                        .slice(0, 12)
                        .map((q) => (
                          <div
                            key={q.id}
                            className="rounded-3xl border border-white/6 bg-white/3 p-4 hover:border-white/10 transition-all"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-2xl bg-linear-to-tr from-purple-600/20 to-blue-600/20 flex items-center justify-center font-black text-xs shrink-0">
                                  #{q.queue_number}
                                </div>

                                <div className="min-w-0">
                                  <p className="text-sm font-black text-white truncate">
                                    {getUserName(q.users)}
                                  </p>
                                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    {new Date(q.created_at).toLocaleDateString(
                                      "id-ID",
                                      {
                                        day: "numeric",
                                        month: "short",
                                        timeZone: "Asia/Jakarta",
                                      },
                                    )}
                                  </p>
                                </div>
                              </div>

                              <p className="text-sm font-black text-green-400 shrink-0">
                                Rp {q.price?.toLocaleString("id-ID")}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === "history" ? (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  <div className="xl:col-span-4 rounded-4xl border border-white/8 bg-linear-to-br from-purple-500/15 to-purple-500/5 p-8 md:p-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
                      Total Session
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white leading-none">
                      {sessionHistory.length}
                    </h2>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Total sesi selesai
                    </p>
                  </div>

                  <div className="xl:col-span-4 rounded-4xl border border-white/8 bg-linear-to-br from-green-500/15 to-green-500/5 p-8 md:p-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
                      Revenue History
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white leading-none">
                      Rp{" "}
                      {sessionHistory
                        .reduce(
                          (sum: number, session: any) =>
                            sum + (session.totalRevenue || 0),
                          0,
                        )
                        .toLocaleString("id-ID")}
                    </h2>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Total pendapatan histori
                    </p>
                  </div>

                  <div className="xl:col-span-4 rounded-4xl border border-white/10 bg-linear-to-br from-blue-600/20 to-cyan-600/20 p-8 md:p-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
                      Latest Closed Session
                    </p>
                    <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white leading-tight">
                      {sessionHistory[0]?.title || "Belum ada sesi selesai"}
                    </h2>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      Session terbaru
                    </p>
                  </div>
                </div>

                <div className="rounded-4xl border border-white/8 bg-white/3 p-8 md:p-10">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">
                        Session Archive
                      </p>
                      <h3 className="text-2xl font-black italic tracking-tighter text-white">
                        History Sesi
                      </h3>
                    </div>

                    <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10">
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                        {sessionHistory.length} archived sessions
                      </span>
                    </div>
                  </div>

                  {sessionHistory.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {sessionHistory.map((session: any) => (
                        <button
                          key={session.id}
                          onClick={() => getSessionDetails(session.id)}
                          className="group text-left rounded-4xl border border-white/8 bg-linear-to-br from-white/5 to-white/2 p-6 hover:border-white/15 hover:bg-white/5 transition-all hover:-translate-y-1"
                        >
                          <div className="flex items-center justify-between gap-3 mb-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-500">
                              Session
                            </p>
                            <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[8px] font-black text-green-400 uppercase tracking-[0.18em]">
                              {session.status}
                            </span>
                          </div>

                          <h4 className="text-xl font-black italic tracking-tighter text-white mb-5 line-clamp-2 group-hover:text-purple-300 transition-colors">
                            {session.title}
                          </h4>

                          <div className="space-y-3 mb-6">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                Mulai
                              </span>
                              <span className="text-xs font-bold text-slate-300 text-right">
                                {formatDateTime(session.started_at)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                Selesai
                              </span>
                              <span className="text-xs font-bold text-slate-300 text-right">
                                {formatDateTime(session.ended_at)}
                              </span>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/6 flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                              Lihat Detail
                            </span>
                            <svg
                              className="w-4 h-4 text-purple-400 group-hover:translate-x-1 transition-transform"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-4xl border border-white/8 bg-white/3 p-10 text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
                        History Kosong
                      </p>
                      <h3 className="text-3xl font-black italic tracking-tighter text-white mb-3">
                        Belum Ada Sesi Selesai
                      </h3>
                      <p className="text-slate-500 max-w-xl mx-auto">
                        Semua sesi yang telah diselesaikan akan muncul di sini
                        dengan detail lengkap.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="relative w-full rounded-[3rem] overflow-hidden border border-white/10 bg-white/2">
                  <div className="relative w-full flex items-center justify-center">
                    <Image
                      src="/foto.jpg"
                      alt="Crazy Spirit"
                      width={1200}
                      height={800}
                      className="object-contain"
                    />
                  </div>
                </div>

                <div className="p-8 bg-white/2 rounded-4xl border border-white/5 text-center">
                  <p className="text-gray-400 text-sm font-bold">
                    Tampilan Galeri Crazy Spirit - Upload foto.jpg ke folder
                    public
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="relative w-full max-w-lg rounded-4xl border border-white/10 bg-[#0E0E11]/95 backdrop-blur-xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-purple-600 via-fuchsia-500 to-blue-600" />

              <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-3">
                    Payment Form
                  </p>
                  <h2 className="text-3xl font-black italic tracking-tighter text-white">
                    Input Payment
                  </h2>
                  <p className="mt-3 text-sm text-slate-500">
                    Queue #{selectedQueue?.queue_number} •{" "}
                    {getUserName(selectedQueue?.users || null)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-3xl border border-white/8 bg-white/3 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-2">
                      Customer
                    </p>
                    <p className="text-base font-black text-white truncate">
                      {getUserName(selectedQueue?.users || null)}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-white/3 p-4 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-2">
                      Queue ID
                    </p>
                    <p className="text-base font-black text-white">
                      #{selectedQueue?.queue_number}
                    </p>
                  </div>
                </div>

                <div className="rounded-4xl border border-white/10 bg-linear-to-b from-white/5 to-transparent p-6 mb-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 mb-4">
                    Total Payment
                  </p>

                  <div className="relative">
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl md:text-4xl font-black text-slate-500">
                      Rp
                    </span>
                    <input
                      autoFocus
                      type="number"
                      placeholder="0"
                      value={inputPrice}
                      onChange={(e) => setInputPrice(e.target.value)}
                      className="w-full bg-transparent border-0 border-b border-white/10 pl-16 pr-2 py-4 text-4xl md:text-5xl font-black text-white outline-none focus:border-purple-500 placeholder:text-slate-800"
                    />
                  </div>

                  <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                    Masukkan nominal pembayaran customer. Setelah disimpan, Anda
                    bisa langsung memilih template WhatsApp.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setInputPrice("");
                    }}
                    className="py-4 rounded-2xl border border-white/8 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-[0.22em] transition-all"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={async () => {
                      if (selectedQueue && inputPrice) {
                        await updateStatus(
                          selectedQueue.id,
                          "selesai",
                          parseInt(inputPrice),
                        );

                        const phone = getUserPhone(selectedQueue.users);
                        const name = getUserName(selectedQueue.users);

                        if (phone && name) {
                          setWhatsAppData({
                            phone,
                            name,
                            queueNumber: selectedQueue.queue_number,
                          });
                          setIsWhatsAppModalOpen(true);
                        }

                        setIsModalOpen(false);
                        setInputPrice("");
                      }
                    }}
                    className="py-4 rounded-2xl bg-linear-to-r from-purple-600 to-blue-600 hover:brightness-110 text-white font-black text-[10px] uppercase tracking-[0.22em] transition-all shadow-xl shadow-purple-900/40"
                  >
                    Submit & Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isWhatsAppModalOpen && whatsAppData && (
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
            <div className="absolute w-80 h-80 bg-green-500/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="relative w-full max-w-xl rounded-4xl border border-white/10 bg-[#0D0D10]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-green-500 via-emerald-500 to-teal-500" />

              <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-3">
                    WhatsApp Sender
                  </p>
                  <h2 className="text-3xl font-black italic tracking-tighter text-white">
                    Pesan WhatsApp
                  </h2>
                  <p className="mt-3 text-sm text-slate-400">
                    {whatsAppData.name} • Queue #{whatsAppData.queueNumber}
                  </p>
                </div>

                <div className="space-y-4 mb-8 max-h-115 overflow-y-auto pr-2">
                  <button
                    onClick={() => {
                      const msg = whatsAppTemplates.selesai(
                        whatsAppData.name,
                        whatsAppData.queueNumber,
                      );
                      sendWhatsApp(whatsAppData.phone, msg);
                      setIsWhatsAppModalOpen(false);
                    }}
                    className="group w-full rounded-[1.8rem] border border-white/8 bg-white/3 p-5 text-left transition-all hover:bg-green-500/10 hover:border-green-500/30"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-green-400 uppercase text-xs tracking-[0.22em] mb-2">
                          Ambil Foto
                        </p>
                        <p className="text-sm text-slate-300 font-bold mb-1">
                          Beri tahu customer bahwa sesi sudah selesai
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Template ini cocok untuk mengarahkan customer
                          mengambil hasil foto dengan cepat dan jelas.
                        </p>
                      </div>

                      <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-green-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.3"
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.3"
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      const msg = whatsAppTemplates.next_turn(
                        whatsAppData.name,
                        whatsAppData.queueNumber,
                      );
                      sendWhatsApp(whatsAppData.phone, msg);
                      setIsWhatsAppModalOpen(false);
                    }}
                    className="group w-full rounded-[1.8rem] border border-white/8 bg-white/3 p-5 text-left transition-all hover:bg-blue-500/10 hover:border-blue-500/30"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-blue-400 uppercase text-xs tracking-[0.22em] mb-2">
                          Follow Media Sosial
                        </p>
                        <p className="text-sm text-slate-300 font-bold mb-1">
                          Ajak customer follow Instagram dan TikTok
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Cocok untuk meningkatkan engagement setelah sesi
                          selesai.
                        </p>
                      </div>

                      <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.3"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      const msg = whatsAppTemplates.reminder(
                        whatsAppData.name,
                        whatsAppData.queueNumber,
                      );
                      sendWhatsApp(whatsAppData.phone, msg);
                      setIsWhatsAppModalOpen(false);
                    }}
                    className="group w-full rounded-[1.8rem] border border-white/8 bg-white/3 p-5 text-left transition-all hover:bg-yellow-500/10 hover:border-yellow-500/30"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-yellow-400 uppercase text-xs tracking-[0.22em] mb-2">
                          Kembali Lagi
                        </p>
                        <p className="text-sm text-slate-300 font-bold mb-1">
                          Kirim pesan santai agar customer datang lagi
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Template ini cocok untuk membangun hubungan ringan dan
                          tetap terasa ramah.
                        </p>
                      </div>

                      <div className="w-10 h-10 rounded-2xl bg-yellow-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-yellow-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.3"
                            d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => setIsWhatsAppModalOpen(false)}
                  className="w-full py-4 bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all duration-300"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}

        {isSessionDetailOpen && selectedSessionDetail && (
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
            <div className="absolute w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="relative w-full max-w-4xl rounded-4xl border border-white/10 bg-[#0D0D10]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-purple-500 via-fuchsia-500 to-blue-500" />

              <div className="p-8 md:p-10">
                <div className="flex items-start justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-3">
                      Session Detail
                    </p>
                    <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter text-white">
                      {selectedSessionDetail.title}
                    </h2>
                    <p className="mt-3 text-sm text-slate-400">
                      Detail lengkap sesi yang telah diselesaikan
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setIsSessionDetailOpen(false);
                      setSelectedSessionDetail(null);
                    }}
                    className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/8 text-slate-400 hover:text-white transition-all"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                  <DetailCard
                    label="Nama Sesi"
                    value={selectedSessionDetail.title}
                    icon="📝"
                  />
                  <DetailCard
                    label="Status"
                    value={selectedSessionDetail.status.toUpperCase()}
                    icon="✓"
                  />
                  <DetailCard
                    label="Waktu Mulai"
                    value={formatDateTime(selectedSessionDetail.started_at)}
                    icon="▶"
                  />
                  <DetailCard
                    label="Waktu Selesai"
                    value={formatDateTime(selectedSessionDetail.ended_at)}
                    icon="⊘"
                  />
                  <DetailCard
                    label="Total Antrian"
                    value={`${selectedSessionDetail.totalQueues} orang`}
                    icon="👥"
                  />
                  <DetailCard
                    label="Transaksi Selesai"
                    value={`${selectedSessionDetail.completedQueues}/${selectedSessionDetail.totalQueues}`}
                    icon="🎯"
                  />
                </div>

                <div className="rounded-4xl border border-green-500/15 bg-linear-to-br from-green-500/10 to-emerald-500/5 p-6 md:p-8 mb-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-green-400 mb-3">
                    Total Revenue
                  </p>
                  <p className="text-4xl md:text-5xl font-black text-white leading-none tracking-tighter">
                    Rp{" "}
                    {selectedSessionDetail.totalRevenue.toLocaleString("id-ID")}
                  </p>
                  <p className="mt-3 text-xs text-slate-500 font-bold">
                    Total pendapatan dari semua transaksi selesai dalam sesi ini
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setIsSessionDetailOpen(false);
                      setSelectedSessionDetail(null);
                    }}
                    className="py-4 rounded-2xl border border-white/8 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-[0.22em] transition-all"
                  >
                    Tutup
                  </button>

                  <button className="py-4 rounded-2xl bg-linear-to-r from-purple-600 to-blue-600 hover:brightness-110 text-white font-black text-[10px] uppercase tracking-[0.22em] transition-all shadow-xl shadow-purple-900/30">
                    Export Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-full bg-black/50 border-t border-white/5 py-6 px-8 flex items-center justify-center">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          Copyright © 2026 <span className="text-purple-400">ryhnar25</span>,
          All rights reserved
        </p>
      </div>
    </div>
  );
}

function DetailCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/3 p-4 hover:bg-white/5 transition-all">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
          {label}
        </p>
      </div>
      <p className="text-sm font-black text-white break-break-words">{value}</p>
    </div>
  );
}

function SidebarTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.24em] transition-all ${
        active
          ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-900/25"
          : "text-gray-500 bg-white/0 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function SessionInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/3 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-2">
        {label}
      </p>
      <p className="text-sm font-black text-white leading-relaxed">{value}</p>
    </div>
  );
}

function StatCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string | number;
  tone: "green" | "emerald" | "sky";
}) {
  const tones: Record<string, string> = {
    green: "from-green-500/20 to-green-500/5 border-green-500/20",
    emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
    sky: "from-sky-500/20 to-sky-500/5 border-sky-500/20",
  };

  return (
    <div
      className={`rounded-4xl border bg-linear-to-br p-8 md:p-10 ${tones[tone]}`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
        {title}
      </p>
      <p className="text-4xl md:text-5xl font-black tracking-tighter text-white leading-none">
        {value}
      </p>
    </div>
  );
}

function Column({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  const textColor =
    color === "blue"
      ? "text-blue-400"
      : color === "green"
        ? "text-green-500"
        : color === "orange"
          ? "text-orange-500"
          : color === "purple"
            ? "text-purple-400"
            : "text-gray-500";

  return (
    <section className="rounded-4xl border border-white/5 bg-white/2 p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-1">
        <h2
          className={`text-[11px] font-black uppercase tracking-[0.28em] ${textColor}`}
        >
          {title}
        </h2>
        <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-[9px] font-bold text-gray-400 leading-none">
          {count}
        </span>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function QueueCard({
  q,
  onAction,
  label,
  color,
  onDelete,
  setWhatsAppData,
  setIsWhatsAppModalOpen,
  loadingId,
  compact = false,
}: {
  q: Queue;
  onAction?: () => void;
  label?: string;
  color: string;
  onDelete?: (id: string) => void;
  setWhatsAppData: (data: WhatsAppData) => void;
  setIsWhatsAppModalOpen: (value: boolean) => void;
  loadingId: string | null;
  compact?: boolean;
}) {
  const isSelesai = q.status === "selesai";
  const isLoading = loadingId === q.id;

  const userName = q.users
    ? Array.isArray(q.users)
      ? q.users[0]?.name || "Guest User"
      : q.users.name
    : "Guest User";

  const userPhone = q.users
    ? Array.isArray(q.users)
      ? q.users[0]?.phone || ""
      : q.users.phone
    : "";

  const colors: Record<string, string> = {
    purple: "border-purple-500/10 bg-purple-500/5",
    blue: "border-blue-500/10 bg-blue-500/5",
    yellow: "border-yellow-500/10 bg-yellow-500/5",
    green: "border-green-500/10 bg-green-500/5",
    orange: "border-orange-500/10 bg-orange-500/5",
    gray: "border-white/10 bg-white/3",
  };

  return (
    <div
      className={`border transition-all duration-300 ${
        compact ? "p-3 rounded-3xl" : "p-6 rounded-4xl"
      } ${colors[color] || colors.gray}`}
    >
      <div
        className={`flex justify-between items-start ${compact ? "mb-4" : "mb-5"} gap-3`}
      >
        <div>
          <h3
            className={`font-black italic tracking-tighter bg-clip-text text-transparent bg-linear-to-b from-white to-gray-600 leading-none ${
              compact ? "text-2xl mb-1" : "text-4xl mb-2"
            }`}
          >
            #{q.queue_number}
          </h3>
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.22em] truncate max-w-36">
            {userName}
          </p>
        </div>

        <div className="text-right">
          {q.price ? (
            <p className="text-[11px] font-black text-green-400 tracking-tight">
              Rp {q.price.toLocaleString("id-ID")}
            </p>
          ) : isSelesai ? (
            <span className="text-[10px] text-white/20 italic font-bold">
              UNPAID
            </span>
          ) : null}
        </div>
      </div>

      {!isSelesai && onAction && label && (
        <button
          onClick={onAction}
          disabled={isLoading}
          className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.22em] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            color === "yellow"
              ? "bg-yellow-500 text-black shadow-lg shadow-yellow-900/10 animate-pulse"
              : color === "orange"
                ? "bg-orange-500 text-white hover:bg-orange-600"
                : color === "blue"
                  ? "bg-blue-500/20 text-blue-200 hover:bg-blue-500/30"
                  : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          {isLoading ? "Processing..." : label}
        </button>
      )}

      {isSelesai && userPhone && (
        <button
          onClick={() => {
            setWhatsAppData({
              phone: userPhone,
              name: userName,
              queueNumber: q.queue_number,
            });
            setIsWhatsAppModalOpen(true);
          }}
          className="w-full py-3 bg-green-500/10 text-green-500 border border-green-500/20 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-green-500 hover:text-white transition-all"
        >
          Resend WhatsApp 
        </button>
      )}

      {onDelete && (
        <button
          onClick={() => onDelete(q.id)}
          disabled={isLoading}
          className="w-full mt-3 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Deleting..." : "Delete"}
        </button>
      )}
    </div>
  );
}

const whatsAppTemplates = {
  selesai: (name: string, queueNumber: number) =>
    `Halo ${name} \n\nTerimakasih telah berkunjung dan silahkan ambil foto kamu!\n\nNomor antrian: ${queueNumber}\n\nSayunk Photobooth `,
  next_turn: (name: string, queueNumber: number) =>
    `Halo ${name} \n\nJangan lupa follow instagram dan tik tok kami @sayunk_photobooth.\n\nNomor antrian: ${queueNumber}\n\nSayunk Photobooth `,
  reminder: (name: string, queueNumber: number) =>
    `Halo ${name} \n\nBuah stoberi buah ceri jangan lupa kembali lagiiiii \n\nNomor antrian: ${queueNumber}\n\nSayunk Photobooth `,
};

const sendWhatsApp = (phone: string, message: string) => {
  const formatted = phone.replace(/^0/, "62");
  window.open(
    `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`,
    "_blank",
  );
};
