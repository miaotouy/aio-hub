// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

use super::{fetcher, net, proxy};
use axum::{
    body::Body,
    http::{Request, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::{sync::Arc, time::Duration};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

async fn fixture(started: Arc<Notify>) -> (String, tokio::task::JoinHandle<()>) {
    let router = Router::new()
        .route(
            "/gbk",
            get(|| async {
                (
                    [("content-type", "text/html; charset=gbk")],
                    vec![0xd6, 0xd0, 0xce, 0xc4],
                )
            }),
        )
        .route(
            "/challenge",
            get(|| async { (StatusCode::FORBIDDEN, "captcha") }),
        )
        .route(
            "/slow",
            get(move || {
                let started = started.clone();
                async move {
                    started.notify_one();
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    "late"
                }
            }),
        )
        .fallback(|req: Request<Body>| async move {
            if req.uri().path() == "/redirect" {
                let destination =
                    url::form_urlencoded::parse(req.uri().query().unwrap_or("").as_bytes())
                        .find(|(key, _)| key == "to")
                        .unwrap()
                        .1
                        .into_owned();
                return axum::response::Redirect::temporary(&destination).into_response();
            }
            let header = |name| {
                req.headers()
                    .get(name)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
            };
            let html = format!(
                "<HTML><HEAD></HEAD><BODY><article>{}|{}|{}|{}|{}|{}|{}</article></BODY></HTML>",
                req.uri(),
                header("cookie"),
                header("user-agent"),
                header("accept-language"),
                header("referer"),
                header("origin"),
                header("authorization")
            );
            (
                [
                    ("content-type", "text/html; charset=utf-8"),
                    ("set-cookie", "server=synthetic; HttpOnly; Path=/"),
                ],
                html,
            )
                .into_response()
        });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let worker = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    (origin, worker)
}
fn direct() -> net::ProxySettings {
    net::ProxySettings {
        mode: "none".into(),
        custom_url: String::new(),
    }
}
async fn session() -> (proxy::SharedProxyState, u16, String) {
    let state = proxy::new_proxy_state(CancellationToken::new());
    let port = proxy::distillery_start_proxy(state.clone(), direct())
        .await
        .unwrap();
    let origin = proxy::distillery_get_proxy_origin(state.clone())
        .await
        .unwrap()
        .unwrap();
    (state, port, origin)
}
fn client() -> wreq::Client {
    wreq::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap()
}
async fn call(port: u16, origin: &str, path: &str) -> wreq::Response {
    client()
        .get(format!("http://127.0.0.1:{port}{path}"))
        .header("host", origin.strip_prefix("http://").unwrap())
        .send()
        .await
        .unwrap()
}
fn proxy_path(url: &str) -> String {
    format!(
        "/proxy?{}",
        url::form_urlencoded::Serializer::new(String::new())
            .append_pair("url", url)
            .finish()
    )
}

// Protects the frontend payload and browser fingerprint contract, including non-UTF8/challenge pages.
#[tokio::test]
async fn quick_fetch_preserves_fingerprint_encoding_and_challenge() {
    let (target, worker) = fixture(Arc::new(Notify::new())).await;
    let fingerprint = fetcher::BrowserFingerprint {
        user_agent: "FixtureBrowser/1".into(),
        accept_language: "zh-CN".into(),
        platform: None,
        sec_ch_ua: None,
        sec_ch_ua_platform: None,
        sec_ch_ua_mobile: None,
    };
    let payload = fetcher::distillery_quick_fetch(
        Some(direct()),
        format!("{target}/read?q=%252F"),
        None,
        Some("identity=sample".into()),
        Some(fingerprint),
    )
    .await
    .unwrap();
    assert!(payload
        .html
        .contains("/read?q=%252F|identity=sample|FixtureBrowser/1|zh-CN"));
    assert_eq!(payload.status_code, 200);
    assert_eq!(payload.content_length, payload.html.len());
    let encoded =
        fetcher::distillery_quick_fetch(Some(direct()), format!("{target}/gbk"), None, None, None)
            .await
            .unwrap();
    assert_eq!(encoded.html, "中文");
    let challenge = fetcher::distillery_quick_fetch(
        Some(direct()),
        format!("{target}/challenge"),
        None,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(challenge.is_challenge_page);
    assert_eq!(challenge.status_code, 403);
    let (other, other_worker) = fixture(Arc::new(Notify::new())).await;
    let redirect = format!(
        "{target}/redirect?{}",
        url::form_urlencoded::Serializer::new(String::new())
            .append_pair("to", &format!("{other}/landing"))
            .finish()
    );
    let payload = fetcher::distillery_quick_fetch(
        Some(direct()),
        redirect.clone(),
        Some(fetcher::QuickFetchOptions {
            url: redirect,
            headers: Some(std::collections::HashMap::from([(
                "Authorization".into(),
                "Bearer synthetic".into(),
            )])),
            cookie_profile: None,
            timeout: None,
        }),
        Some("redirect-secret=synthetic".into()),
        None,
    )
    .await
    .unwrap();
    assert_eq!(payload.status_code, 200);
    assert!(payload.html.contains("/landing||"));
    assert!(!payload.html.contains("Bearer synthetic"));
    other_worker.abort();
    worker.abort();
}

// Protects session/identity isolation and single decoding of encoded target URLs.
#[tokio::test]
async fn private_proxy_isolates_identity_and_rewrites_resources() {
    let (target, worker) = fixture(Arc::new(Notify::new())).await;
    let (other, other_worker) = fixture(Arc::new(Notify::new())).await;
    let (a, port_a, origin_a) = session().await;
    let (b, port_b, origin_b) = session().await;
    assert_ne!(origin_a, origin_b);
    proxy::distillery_set_proxy_cookies(a.clone(), Some("identity=A".into()))
        .await
        .unwrap();
    proxy::distillery_set_proxy_cookies(b.clone(), Some("identity=B".into()))
        .await
        .unwrap();
    proxy::distillery_set_proxy_local_storage(
        a.clone(),
        Some(r#"{"token":"</script>sample"}"#.into()),
    )
    .await
    .unwrap();
    assert_eq!(
        client()
            .get(format!("http://127.0.0.1:{port_a}/proxy"))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let url = format!("{target}/dir/read?q=%252F&name=one%26two");
    let response = call(port_a, &origin_a, &proxy_path(&url)).await;
    assert!(response.headers().get("set-cookie").is_none());
    assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    let html = response.text().await.unwrap();
    assert!(html.contains("/dir/read?q=%252F&name=one%26two|identity=A"));
    assert!(html.contains(r#"<base href="/dir/read">"#));
    assert!(html.contains(r"\u003c/script>sample"));
    assert!(html.contains("localStorage.clear()"));
    assert!(call(port_b, &origin_b, &proxy_path(&url))
        .await
        .text()
        .await
        .unwrap()
        .contains("|identity=B|"));
    let external = format!(
        "/proxy-resource?{}",
        url::form_urlencoded::Serializer::new(String::new())
            .append_pair("url", &format!("{other}/external"))
            .finish()
    );
    let resource = call(port_a, &origin_a, &external)
        .await
        .text()
        .await
        .unwrap();
    assert!(resource.contains("/external||"));
    let cookies = proxy::distillery_get_proxy_cookies(a.clone())
        .await
        .unwrap()
        .unwrap();
    assert!(cookies.contains("identity=A"));
    let response = client()
        .post(format!("http://127.0.0.1:{port_a}/api"))
        .header("host", origin_a.strip_prefix("http://").unwrap())
        .header("referer", &origin_a)
        .header("origin", &origin_a)
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(response.contains(&format!("|{target}/|{target}")));
    assert!(!response.contains(&origin_a));
    call(port_a, &origin_a, &proxy_path(&format!("{other}/next")))
        .await
        .text()
        .await
        .unwrap();
    assert!(!proxy::distillery_get_proxy_cookies(a.clone())
        .await
        .unwrap()
        .unwrap()
        .contains("identity=A"));
    proxy::distillery_stop_proxy(a).await.unwrap();
    proxy::distillery_stop_proxy(b).await.unwrap();
    worker.abort();
    other_worker.abort();
}

// Protects teardown: a delayed upstream request cannot keep the window's listener alive.
#[tokio::test]
async fn stopping_proxy_cancels_inflight_and_releases_port() {
    let started = Arc::new(Notify::new());
    let (target, worker) = fixture(started.clone()).await;
    let (state, port, origin) = session().await;
    let request = tokio::spawn(async move {
        call(port, &origin, &proxy_path(&format!("{target}/slow")))
            .await
            .status()
    });
    tokio::time::timeout(Duration::from_secs(2), started.notified())
        .await
        .unwrap();
    tokio::time::timeout(
        Duration::from_secs(2),
        proxy::distillery_stop_proxy(state.clone()),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(request.await.unwrap(), 503);
    assert_eq!(
        proxy::distillery_get_proxy_port(state.clone())
            .await
            .unwrap(),
        0
    );
    assert!(proxy::distillery_get_proxy_origin(state)
        .await
        .unwrap()
        .is_none());
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .unwrap();
    drop(listener);
    worker.abort();
}
