use local_ip_address::list_afinet_netifas;

#[tauri::command]
pub async fn get_local_ips() -> Result<Vec<String>, String> {
    let network_interfaces = list_afinet_netifas().map_err(|e| e.to_string())?;
    
    let mut ips = Vec::new();
    for (_name, ip) in network_interfaces {
        // 排除回环地址
        if !ip.is_loopback() {
            ips.push(ip.to_string());
        }
    }
    
    // 如果没有找到非回环地址，至少返回一个空列表或回环地址
    if ips.is_empty() {
        // 重新检查是否包含回环地址，有些情况下可能需要
        for (_name, ip) in list_afinet_netifas().map_err(|e| e.to_string())? {
            if ip.is_loopback() {
                ips.push(ip.to_string());
                break;
            }
        }
    }

    Ok(ips)
}