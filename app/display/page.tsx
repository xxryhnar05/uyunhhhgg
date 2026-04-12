"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { playNotificationSound } from "@/lib/audioNotification";

interface Queue {
  id: string;
  queue_number: number;
  status: string;
  user_id: string;
}

export default function DisplayPage() {
  const [current, setCurrent] = useState<Queue | null>(null);
  const [lastQueueId, setLastQueueId] = useState<string | null>(null);

  const fetchCurrent = async () => {
    const { data } = await supabase
      .from("queues")
      .select("*")
      .eq("status", "called")
      .order("queue_number", { ascending: false })
      .limit(1)
      .single();

    if (data && data.id !== lastQueueId) {
      setCurrent(data);
      setLastQueueId(data.id);
      // Putar notifikasi audio ketika antrian baru dipanggil
      playNotificationSound();
    } else if (data) {
      setCurrent(data);
    }
  };

  useEffect(() => {
    fetchCurrent();

    const channel = supabase
      .channel("queues")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queues" },
        () => {
          fetchCurrent();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="text-center text-5xl">
      <h1>Nomor Dipanggil</h1>
      <h2>{current?.queue_number}</h2>
    </div>
  );
}
