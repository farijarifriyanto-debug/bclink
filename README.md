# bclink

Jalankan Claude Code dan Codex dengan model BotConnector (botconnector.id), tanpa mengubah pengaturan tool Anda.

Status: **belum dipublikasikan** (`private`). Mendukung Claude Code dan Codex. OpenCode tidak didukung, lihat di bawah. Hanya model yang ada di `/v1/models` BotConnector yang bisa dipakai.

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
