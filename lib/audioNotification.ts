// Audio Notification Helper
export const playNotificationSound = () => {
  // Menggunakan file audio MP3 jika tersedia
  playSoundFromUrl("/notification.mp3");
};

// Alternatif: Menggunakan URL suara (jika ada file audio)
export const playSoundFromUrl = (url: string) => {
  try {
    const audio = new Audio(url);
    audio.volume = 1.0;
    audio.play().catch((err) => {
      console.log("Audio play error, using fallback bell sound:", err);
      // Fallback ke bell notification jika file gagal
      playBellNotification();
    });
  } catch (err) {
    console.error("Error creating audio:", err);
    playBellNotification();
  }
};

// Bel notifikasi dengan multiple tones (backup jika audio file tidak tersedia)
export const playBellNotification = () => {
  try {
    const audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();

    const now = audioContext.currentTime;

    // Membuat efek bel dengan multiple resonances
    const notes = [
      { freq: 1046.5, duration: 0.2 }, // C6
      { freq: 1318.5, duration: 0.2 }, // E6
      { freq: 1568, duration: 0.4 }, // G6
    ];

    notes.forEach((note, index) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = note.freq;
      oscillator.type = "sine";

      const startTime =
        now + notes.slice(0, index).reduce((sum, n) => sum + n.duration, 0);
      const endTime = startTime + note.duration;

      gainNode.gain.setValueAtTime(0.6, startTime);
      gainNode.gain.linearRampToValueAtTime(0.0, endTime);

      oscillator.start(startTime);
      oscillator.stop(endTime);
    });
  } catch (err) {
    console.error("Audio context error:", err);
  }
};
