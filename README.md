# bclink

Jalankan Claude Code dan Codex dengan model BotConnector (botconnector.id), tanpa mengubah pengaturan tool Anda.

Mendukung Claude Code dan Codex. OpenCode tidak didukung, lihat di bawah. Hanya model yang ada di `/v1/models` BotConnector yang bisa dipakai.

## Pasang

Butuh Node.js 18.18 atau lebih baru, dan Claude Code dan/atau Codex CLI yang sudah terpasang sendiri. Kunci API dibuat di [Workspace BotConnector](https://app.botconnector.id/workspace/#/api).

```bash
npm install -g @botconnector/link
bclink --version
```

Paket ini ada di npm: https://www.npmjs.com/package/@botconnector/link

## Pemakaian

```bash
bclink configure --api-key bc_live_...   # validasi dan simpan kunci
bclink models                            # daftar model yang tersedia
bclink claude -p "ringkas folder ini"    # Claude Code, model default
bclink --main agnes-3.0-flash claude     # Claude Code, model dipilih
bclink codex exec "ringkas folder ini"   # Codex CLI, model default
```

Urutan kunci: `--api-key`, lalu kunci tersimpan dari `configure`, lalu `BOTCONNECTOR_API_KEY`. File `.env` proyek tidak dibaca.

## Cara kerja

- **Claude Code:** variabel environment untuk satu sesi (`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`), dan folder konfigurasi sementara lewat `CLAUDE_CONFIG_DIR` yang dihapus setelah sesi. `~/.claude` tidak disentuh. Karena itu plugin, hook, dan MCP server Anda **tidak aktif** di sesi `bclink`.
- **Codex:** pengaturan provider diberikan lewat flag `-c` dan `-m` untuk satu sesi (`wire_api="responses"`). Kunci hanya ada di environment (`BOTCONNECTOR_API_KEY`), tidak di argumen. `~/.codex` tidak ditulis, sehingga hook dan konfigurasi Codex Anda tetap berlaku.
- Model default diambil dari `default_model` di `/v1/integrations`. `--main` harus berupa model yang ada di `/v1/models`.

## Ringkasan kuota di akhir sesi

Setelah Claude Code atau Codex selesai, `bclink` mencetak selisih kuota paket akun Anda ke **stderr** (stdout tool tidak berubah, jadi aman untuk skrip):

```
Kuota paket terpakai: $0.006354 (0.38% dari kuota bulanan)
Ini selisih akun; pemakaian lain di akun yang sama ikut terhitung.
```

- Sumbernya snapshot `GET /v1/usage` sebelum dan sesudah sesi. Endpoint itu belum ada di dokumentasi publik BotConnector, jadi bentuknya bisa berubah.
- Angkanya mikro-USD biaya provider. Satuan ini dicocokkan dengan harga publik `deepseek-v4.1-flash`, dan ringkasan dicocokkan dengan selisih `/v1/usage` yang dibaca terpisah: Claude Code 6.354 mikro-USD dan Codex 1.822 mikro-USD, keduanya sama persis. Jalur model gratis juga diuji di kedua tool.
- Ini **selisih akun**, bukan hitungan per sesi yang pasti. Pemakaian dari klien lain di akun yang sama ikut terhitung.
- Pembukuan muncul dalam beberapa detik. Kalau belum berubah, `bclink` menunggu 3 detik dan membaca sekali lagi.
- Saldo **PAYG tidak ditampilkan sebagai angka**, karena satuannya belum terverifikasi. Jika berubah, hanya muncul catatan "Saldo PAYG berubah".
- Tidak ada perbandingan "hemat dibanding model lain". Datanya tidak mendukung itu.
- Kegagalan membaca `/v1/usage` hanya melewati ringkasan. Kode keluar tool tidak pernah diubah.
- Lewati dengan `bclink --no-summary ...`.

## Kenapa OpenCode belum ada

OpenCode 2.0.32 hanya memuat provider kustom dari config proyek (`opencode.json`) atau config global. `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, dan `OPENCODE_CONFIG_CONTENT` tidak memuat provider, sehingga model tidak bisa dipastikan per sesi. Model terakhir yang dipakai dari daftar `recent` OpenCode justru yang berjalan. Tanpa pin, banner akan salah, jadi jalur ini dihapus.

Untuk OpenCode, pakai `bccli connect opencode`. Itu konfigurasi permanen, dan bisa dikembalikan dengan `bccli disconnect opencode`.

## Batasan saat ini

- Claude Code dan Codex. OpenCode tidak ada di paket ini.
- Belum ada mode interaktif. Jalankan `bclink` tanpa argumen hanya menampilkan bantuan.
- Model berbayar (`payg:` atau plan) bisa dipilih lewat `--main`. Banner menampilkan aksesnya, tetapi tidak ada konfirmasi biaya.
- Peringatan Claude Code tentang model yang tidak dikenali tetap muncul, karena ID model BotConnector bukan ID Claude.
- Di Windows, argumen dengan tanda kutip ganda diteruskan lewat `cmd.exe`. Diuji dengan argumen sederhana saja.
- Peringatan Claude Code bahwa model tidak dikenali tetap muncul, sehingga context window diasumsikan 200k.

## Pengembangan

```bash
npm test
```

Tes unit memakai fetch dan proses palsu. Uji nyata dengan model gratis dijalankan secara terpisah dan dicatat di log.
