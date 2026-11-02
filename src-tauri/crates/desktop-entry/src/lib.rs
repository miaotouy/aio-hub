//! Keep frontend asset dependencies in the desktop EXE while the backend caches
//! Tauri's configuration, capabilities and context initialization code.

use proc_macro::TokenStream;
use quote::{quote, ToTokens};
use std::{env, path::PathBuf};
use tauri_codegen::embedded_assets::{AssetOptions, EmbeddedAssets};
use tauri_utils::config::{FrontendDist, PatternKind};

/// Starts the desktop app using the caller's Tauri `dev` cfg.
#[proc_macro]
pub fn run(input: TokenStream) -> TokenStream {
    let dev = syn::parse_macro_input!(input as syn::LitBool).value;
    match entry(dev) {
        Ok(tokens) => tokens.into(),
        Err(message) => quote!(compile_error!(#message)).into(),
    }
}

fn entry(dev: bool) -> Result<proc_macro2::TokenStream, String> {
    let manifest = env::var_os("CARGO_MANIFEST_DIR")
        .ok_or_else(|| "CARGO_MANIFEST_DIR is missing".to_string())?;
    let (config, parent) =
        tauri_codegen::get_config(&PathBuf::from(manifest).join("tauri.conf.json"))
            .map_err(|error| error.to_string())?;
    let security = &config.app.security;
    let csp = if dev {
        security.dev_csp.as_ref().or(security.csp.as_ref())
    } else {
        security.csp.as_ref()
    };

    // Tauri's HTML nonce/hash transformation is private to context_codegen.
    // Delegate security-sensitive configurations to the complete official macro.
    if csp.is_some() || !matches!(security.pattern, PatternKind::Brownfield) {
        return Ok(quote!(::aio_hub_lib::run_with_context(
            ::tauri::generate_context!()
        )));
    }

    let options = AssetOptions::new(security.pattern.clone())
        .freeze_prototype(security.freeze_prototype)
        .dangerous_disable_asset_csp_modification(
            security.dangerous_disable_asset_csp_modification.clone(),
        );
    let assets = if dev && config.build.dev_url.is_some() {
        EmbeddedAssets::default()
    } else {
        let paths = match config.build.frontend_dist {
            Some(FrontendDist::Directory(path)) => {
                let path = parent.join(path);
                if !path.exists() {
                    return Err(format!("frontendDist does not exist: {}", path.display()));
                }
                vec![path]
            }
            Some(FrontendDist::Files(paths)) => paths.into_iter().map(|p| parent.join(p)).collect(),
            Some(FrontendDist::Url(_)) | None => Vec::new(),
            Some(_) => return Err("unsupported frontendDist configuration".to_string()),
        };
        EmbeddedAssets::new(paths, &options, |_, _, _, _| Ok(()))
            .map_err(|error| error.to_string())?
    };
    let assets = assets.into_token_stream();
    Ok(quote!(::aio_hub_lib::run_with_assets(#assets)))
}
