// Versão Tauri do editor: a lógica do save roda no WebView (src/tauri-api.js); aqui ficam
// arquivos, zstd, backups, detecção do jogo e o protocolo game:// com os recursos embutidos no exe.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod servidor;
mod sftp;
#[cfg(test)]
mod testes_e2e;

use include_dir::{include_dir, Dir};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::http::Response as HttpResponse;
use tauri::ipc::Response;

// texturas, ícones e fontes extraídos do jogo (tools/pack_assets.py)
static GAME: Dir = include_dir!("$CARGO_MANIFEST_DIR/../build-assets/game");

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn modified_ms(p: &Path) -> f64 {
    fs::metadata(p).and_then(|m| m.modified()).ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

fn is_save(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case("ksd") => Ok(p),
        _ => Err("Só arquivos .ksd podem ser lidos ou gravados".into()),
    }
}

#[cfg(windows)]
fn backup_root() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Documents")
        .join("Enshrouded-Backups").join("editor")
}

#[cfg(target_os = "linux")]
fn backup_root() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .expect("HOME must be set for backups");

    home.join("Documents")
        .join("Enshrouded-Backups").join("editor")
}

#[derive(Serialize)]
struct SaveFile { path: String, file: String, modified: f64 }

#[tauri::command]
fn list_saves() -> Vec<SaveFile> {
    let mut out = Vec::new();
    let mut roots = Vec::<PathBuf>::new();

    #[cfg(windows)]
    {
        roots.push(PathBuf::from("C:/Program Files (x86)/Steam/userdata"));
        roots.push(PathBuf::from("C:/Program Files/Steam/userdata"));
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let home = PathBuf::from(home);
            roots.push(home.join(".local/share/Steam/userdata"));
            roots.push(home.join(".steam/steam/userdata"));
        }
    }

    for root in roots {
        let Ok(users) = fs::read_dir(root) else { continue };

        for user in users.flatten() {
            let dir = user.path().join("1203620").join("remote");
            let Ok(files) = fs::read_dir(dir) else { continue };

            for file in files.flatten() {
                let name = file.file_name().to_string_lossy().to_string();

                let valid = name
                    .strip_prefix("character")
                    .and_then(|s| s.strip_suffix(".ksd"))
                    .is_some_and(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()));

                if valid {
                    out.push(SaveFile {
                        path: file.path().to_string_lossy().to_string(),
                        file: name,
                        modified: modified_ms(&file.path()),
                    });
                }
            }
        }
    }

    out.sort_by(|a, b| b.modified.total_cmp(&a.modified));
    out.dedup_by(|a, b| a.path == b.path);

    out
}

#[derive(Serialize)]
struct FileInfo { modified: f64 }

#[tauri::command]
fn file_info(path: String) -> FileInfo { FileInfo { modified: modified_ms(Path::new(&path)) } }

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    let p = is_save(&path)?;
    fs::read(p).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn zstd_decompress(data: Vec<u8>) -> Result<Response, String> {
    zstd::stream::decode_all(&data[..]).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn zstd_compress(data: Vec<u8>) -> Result<Response, String> {
    zstd::bulk::compress(&data, 19).map(Response::new).map_err(|e| e.to_string())
}

#[cfg(windows)]
#[tauri::command]
fn game_running() -> bool {
    let mut cmd = Command::new("tasklist");
    cmd.args(["/FI", "IMAGENAME eq enshrouded.exe", "/NH"]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output().map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains("enshrouded.exe")).unwrap_or(false)
}


#[cfg(target_os = "linux")]
#[tauri::command]
fn game_running() -> bool {
    let Ok(entries) = fs::read_dir("/proc") else {
        // Fail closed if process inspection is unavailable.
        return true;
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if !name.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }

        let comm = entry.path().join("comm");

        if let Ok(process_name) = fs::read_to_string(comm) {
            if process_name.trim().eq_ignore_ascii_case("enshrouded.exe") {
                return true;
            }
        }
    }

    false
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for e in fs::read_dir(src)?.flatten() {
        let t = dst.join(e.file_name());
        if e.path().is_dir() { copy_dir(&e.path(), &t)?; } else { fs::copy(e.path(), t)?; }
    }
    Ok(())
}

fn make_backup(file: &Path) -> Result<PathBuf, String> {
    let secs = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let dir = backup_root().join(format!("tauri-{secs}"));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::copy(file, dir.join(file.file_name().unwrap())).map_err(|e| e.to_string())?;
    if let Some(parent) = file.parent() {
        let b = parent.join("backup");
        if b.is_dir() { copy_dir(&b, &dir.join("backup")).map_err(|e| e.to_string())?; }
    }
    Ok(dir)
}

#[tauri::command]
fn backup_file(path: String) -> Result<String, String> {
    make_backup(&is_save(&path)?).map(|d| d.to_string_lossy().to_string())
}

#[tauri::command]
fn write_save(path: String, data: Vec<u8>) -> Result<String, String> {
    // Never overwrite an active game save.
    if game_running() {
        return Err("Feche o Enshrouded antes de salvar.".into());
    }

    let p = is_save(&path)?;

    if data.len() < 0x30 || &data[..4] != b"SV2C" {
        return Err("Dados inválidos".into());
    }

    // Backup is mandatory. Any backup failure aborts the write.
    let backup = make_backup(&p)?;

    // Recheck the game after creating the backup.
    if game_running() {
        return Err("Enshrouded iniciou durante o backup. Salvamento cancelado.".into());
    }

    fs::write(&p, data).map_err(|e| {
        format!("Backup criado, mas não foi possível gravar o save: {e}")
    })?;

    Ok(backup.to_string_lossy().into_owned())
}

#[derive(Serialize)]
struct Backup { kind: String, label: String, path: String, modified: f64 }

// pasta com todos os backups (do editor e manuais): Documentos\Enshrouded-Backups
fn backups_home() -> PathBuf { backup_root().parent().map(Path::to_path_buf).unwrap_or_else(backup_root) }

fn collect(dir: &Path, base: &str, kind: &str, depth: u32, out: &mut Vec<Backup>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth > 0 { collect(&p, base, kind, depth - 1, out); }
        } else if e.file_name().to_string_lossy() == base {
            let label = p.parent().and_then(|d| d.strip_prefix(backups_home()).ok()).map(|r| r.to_string_lossy().to_string()).unwrap_or_default();
            out.push(Backup { kind: kind.into(), label, path: p.to_string_lossy().to_string(), modified: modified_ms(&p) });
        }
    }
}

// backups de um save: os 10 automáticos do jogo (remote\backup) e os do editor/manuais
#[tauri::command]
fn list_backups(target: String) -> Vec<Backup> {
    let t = PathBuf::from(&target);
    let base = t.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut out = vec![];
    if let Some(dir) = t.parent() {
        if let Ok(rd) = fs::read_dir(dir.join("backup")) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if n.starts_with(&format!("{base}.backup-")) {
                    out.push(Backup { kind: "jogo".into(), label: n.clone(), path: e.path().to_string_lossy().to_string(), modified: modified_ms(&e.path()) });
                }
            }
        }
    }
    collect(&backups_home(), &base, "pasta", 3, &mut out);
    out.sort_by(|a, b| b.modified.partial_cmp(&a.modified).unwrap_or(std::cmp::Ordering::Equal));
    out
}

#[tauri::command]
fn restore_backup(src: String, target: String) -> Result<(), String> {
    if game_running() { return Err("Feche o Enshrouded antes de restaurar.".into()); }
    let t = is_save(&target)?;
    let s = PathBuf::from(&src);
    let game_backups = t.parent().map(|d| d.join("backup")).unwrap_or_default();
    if !(s.starts_with(backups_home()) || s.starts_with(&game_backups)) || !s.is_file() { return Err("Backup não encontrado".into()); }
    let data = fs::read(&s).map_err(|e| e.to_string())?;
    if data.len() < 4 || &data[..4] != b"SV2C" { return Err("O arquivo de backup não é um save válido".into()); }
    make_backup(&t)?;
    fs::write(t, data).map_err(|e| e.to_string())
}

#[cfg(windows)]
#[tauri::command]
fn open_backups() {
    let r = backups_home();
    let _ = fs::create_dir_all(&r);
    let _ = Command::new("explorer").arg(r).spawn();
}


#[cfg(target_os = "linux")]
#[tauri::command]
fn open_backups() {
    let dir = backups_home();

    if fs::create_dir_all(&dir).is_ok() {
        let _ = Command::new("xdg-open")
            .arg(dir)
            .spawn();
    }
}

// Opens the editor's releases page in the default browser (the update card's "see what's new"). The URL is
// fixed: nothing from the page or the network decides what gets opened.
#[cfg(windows)]
#[tauri::command]
fn open_releases() {
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            op: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> isize;
    }

    let w = |s: &str| s.encode_utf16().chain([0]).collect::<Vec<u16>>();
    let url = "https://github.com/nicolasferreiraxn/Enshrouded-Save-Editor/releases/latest";

    unsafe {
        ShellExecuteW(
            0,
            w("open").as_ptr(),
            w(url).as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        );
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn open_releases() {
    let url = "https://github.com/bisdat/Enshrouded-Save-Editor/releases";

    let _ = Command::new("xdg-open")
        .arg(url)
        .spawn();
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "webp" => "image/webp", "png" => "image/png", "otf" => "font/otf", "ttf" => "font/ttf", _ => "application/octet-stream",
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("game", |_ctx, req| {
            let path = req.uri().path().trim_start_matches('/');
            let path = percent_decode(path);
            match GAME.get_file(&path) {
                Some(f) => HttpResponse::builder().header("Content-Type", mime(&path)).header("Access-Control-Allow-Origin", "*")
                    .body(f.contents().to_vec()).unwrap(),
                None => HttpResponse::builder().status(404).body(Vec::new()).unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_saves, file_info, read_file, zstd_decompress, zstd_compress, game_running,
            backup_file, write_save, list_backups, restore_backup, open_backups, open_releases,
            servidor::servidor_config, servidor::servidor_config_set, servidor::servidor_jogadores,
            servidor::servidor_ler, servidor::servidor_gravar, servidor::servidor_modo,
            servidor::servidor_registro, servidor::servidor_nomes, servidor::servidor_log_guardiao, servidor::servidor_ativo,
            servidor::servidor_recusados, servidor::servidor_recusado_ler, servidor::servidor_hostkey
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o editor");
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}
