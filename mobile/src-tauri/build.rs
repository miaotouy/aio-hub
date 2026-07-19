use std::{env, fs, path::PathBuf};

fn main() {
    let package_path =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../package.json");
    println!("cargo:rerun-if-changed={}", package_path.display());
    let package: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(&package_path).expect("failed to read package.json"),
    )
    .expect("failed to parse package.json");
    let version = package["version"]
        .as_str()
        .expect("package.json version is missing");
    println!("cargo:rustc-env=AIOHUB_APP_VERSION={version}");
    tauri_build::build()
}
