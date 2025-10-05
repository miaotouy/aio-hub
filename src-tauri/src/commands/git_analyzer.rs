use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub full_message: String,
    pub parents: Vec<String>,
    pub tags: Vec<String>,
    pub stats: Option<CommitStats>,
    pub files: Option<Vec<FileChange>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitStats {
    pub additions: u32,
    pub deletions: u32,
    pub files: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
}

#[derive(Debug, Serialize)]
pub struct RepositoryInfo {
    pub branches: Vec<GitBranch>,
    pub commits: Vec<GitCommit>,
}

#[tauri::command]
pub async fn git_load_repository(path: String, limit: usize) -> Result<RepositoryInfo, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    
    // 获取分支列表
    let branches = get_branches(repo_path)?;
    
    // 获取提交记录
    let commits = get_commits(repo_path, None, limit)?;
    
    Ok(RepositoryInfo { branches, commits })
}

#[tauri::command]
pub async fn git_get_branch_commits(
    path: String,
    branch: String,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    get_commits(repo_path, Some(&branch), limit)
}

#[tauri::command]
pub async fn git_get_commit_detail(path: String, hash: String) -> Result<GitCommit, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    
    // 获取提交详情
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("show")
        .arg("--format=%H%n%an%n%ae%n%aI%n%s%n%b%n%P")
        .arg("--stat")
        .arg(&hash)
        .output()
        .map_err(|e| format!("Failed to get commit detail: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = output_str.lines().collect();
    
    if lines.len() < 7 {
        return Err("Invalid git output format".to_string());
    }
    
    // 解析基本信息
    let mut commit = GitCommit {
        hash: lines[0].to_string(),
        author: lines[1].to_string(),
        email: lines[2].to_string(),
        date: lines[3].to_string(),
        message: lines[4].to_string(),
        full_message: format!("{}\n{}", lines[4], lines[5]),
        parents: lines[6].split_whitespace().map(|s| s.to_string()).collect(),
        tags: get_commit_tags(repo_path, &hash)?,
        stats: None,
        files: None,
    };
    
    // 解析文件变更
    let files = get_commit_files(repo_path, &hash)?;
    commit.files = Some(files);
    
    // 解析统计信息
    if let Some(stats) = parse_commit_stats(&output_str) {
        commit.stats = Some(stats);
    }
    
    Ok(commit)
}

#[tauri::command]
pub async fn git_cherry_pick(path: String, hash: String) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("cherry-pick")
        .arg(&hash)
        .output()
        .map_err(|e| format!("Failed to cherry-pick: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(format!("Successfully cherry-picked commit {}", hash))
}

#[tauri::command]
pub async fn git_revert(path: String, hash: String) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("revert")
        .arg("--no-edit")
        .arg(&hash)
        .output()
        .map_err(|e| format!("Failed to revert: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(format!("Successfully reverted commit {}", hash))
}

#[tauri::command]
pub async fn git_export_commits(commits: Vec<GitCommit>, format: String) -> Result<String, String> {
    match format.as_str() {
        "json" => {
            serde_json::to_string_pretty(&commits)
                .map_err(|e| format!("Failed to serialize to JSON: {}", e))
        }
        "csv" => {
            let mut csv = String::from("Hash,Author,Email,Date,Message\n");
            for commit in commits {
                csv.push_str(&format!(
                    "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
                    commit.hash,
                    commit.author,
                    commit.email,
                    commit.date,
                    commit.message.replace("\"", "\"\"")
                ));
            }
            Ok(csv)
        }
        "markdown" => {
            let mut md = String::from("# Git Commits\n\n");
            for commit in commits {
                md.push_str(&format!(
                    "## {} - {}\n\n**Author:** {} <{}>\n**Date:** {}\n\n{}\n\n---\n\n",
                    &commit.hash[0..7],
                    commit.message,
                    commit.author,
                    commit.email,
                    commit.date,
                    commit.full_message
                ));
            }
            Ok(md)
        }
        "html" => {
            let mut html = String::from(
                r#"<!DOCTYPE html>
<html>
<head>
    <title>Git Commits</title>
    <style>
        body { font-family: monospace; padding: 20px; }
        .commit { margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; }
        .hash { color: #0366d6; font-weight: bold; }
        .author { color: #586069; }
        .date { color: #6a737d; }
        .message { margin-top: 10px; }
    </style>
</head>
<body>
    <h1>Git Commits</h1>
"#
            );
            
            for commit in commits {
                html.push_str(&format!(
                    r#"<div class="commit">
                        <span class="hash">{}</span>
                        <span class="author">{}</span>
                        <span class="date">{}</span>
                        <div class="message">{}</div>
                    </div>"#,
                    &commit.hash[0..7],
                    commit.author,
                    commit.date,
                    commit.message
                ));
            }
            
            html.push_str("</body></html>");
            Ok(html)
        }
        _ => Err(format!("Unsupported format: {}", format)),
    }
}

#[tauri::command]
pub async fn git_format_log(path: String, template: String, limit: usize) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("log")
        .arg(format!("--pretty=format:{}", template))
        .arg(format!("-{}", limit))
        .output()
        .map_err(|e| format!("Failed to format log: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// 辅助函数

fn get_branches(repo_path: &str) -> Result<Vec<GitBranch>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("branch")
        .arg("-a")
        .output()
        .map_err(|e| format!("Failed to get branches: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();
    
    for line in output_str.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        
        let current = line.starts_with('*');
        let name = if current {
            line[2..].trim()
        } else {
            line.trim()
        };
        
        let remote = name.starts_with("remotes/");
        let clean_name = if remote {
            name.strip_prefix("remotes/origin/").unwrap_or(name)
        } else {
            name
        };
        
        branches.push(GitBranch {
            name: clean_name.to_string(),
            current,
            remote,
        });
    }
    
    Ok(branches)
}

fn get_commits(repo_path: &str, branch: Option<&str>, limit: usize) -> Result<Vec<GitCommit>, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("log");
    
    if let Some(branch) = branch {
        cmd.arg(branch);
    }
    
    cmd.arg("--pretty=format:%H|%an|%ae|%aI|%s|%b|%P")
        .arg(format!("-{}", limit));
    
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to get commits: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();
    
    for line in output_str.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 7 {
            continue;
        }
        
        let hash = parts[0].to_string();
        let tags = get_commit_tags(repo_path, &hash).unwrap_or_default();
        
        commits.push(GitCommit {
            hash: hash.clone(),
            author: parts[1].to_string(),
            email: parts[2].to_string(),
            date: parts[3].to_string(),
            message: parts[4].to_string(),
            full_message: format!("{}\n{}", parts[4], parts[5]),
            parents: parts[6].split_whitespace().map(|s| s.to_string()).collect(),
            tags,
            stats: get_commit_stats(repo_path, &hash).ok(),
            files: None,
        });
    }
    
    Ok(commits)
}

fn get_commit_tags(repo_path: &str, hash: &str) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("tag")
        .arg("--points-at")
        .arg(hash)
        .output()
        .map_err(|e| format!("Failed to get tags: {}", e))?;
    
    if !output.status.success() {
        return Ok(Vec::new());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    Ok(output_str
        .lines()
        .filter(|line| !line.is_empty())
        .map(|s| s.to_string())
        .collect())
}

fn get_commit_stats(repo_path: &str, hash: &str) -> Result<CommitStats, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("show")
        .arg("--stat")
        .arg("--format=")
        .arg(hash)
        .output()
        .map_err(|e| format!("Failed to get stats: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    parse_commit_stats(&output_str).ok_or_else(|| "Failed to parse stats".to_string())
}

fn parse_commit_stats(output: &str) -> Option<CommitStats> {
    let lines: Vec<&str> = output.lines().collect();
    let last_line = lines.last()?;
    
    // 解析类似 "3 files changed, 10 insertions(+), 5 deletions(-)" 的格式
    let parts: Vec<&str> = last_line.split(',').collect();
    if parts.is_empty() {
        return None;
    }
    
    let files = parts[0]
        .split_whitespace()
        .next()?
        .parse::<u32>()
        .ok()?;
    
    let additions = if parts.len() > 1 {
        parts[1]
            .split_whitespace()
            .next()?
            .parse::<u32>()
            .unwrap_or(0)
    } else {
        0
    };
    
    let deletions = if parts.len() > 2 {
        parts[2]
            .split_whitespace()
            .next()?
            .parse::<u32>()
            .unwrap_or(0)
    } else {
        0
    };
    
    Some(CommitStats {
        additions,
        deletions,
        files,
    })
}

fn get_commit_files(repo_path: &str, hash: &str) -> Result<Vec<FileChange>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("show")
        .arg("--numstat")
        .arg("--format=")
        .arg(hash)
        .output()
        .map_err(|e| format!("Failed to get files: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();
    
    for line in output_str.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }
        
        let additions = parts[0].parse::<u32>().unwrap_or(0);
        let deletions = parts[1].parse::<u32>().unwrap_or(0);
        let path = parts[2].to_string();
        
        // 判断文件状态
        let status = if additions > 0 && deletions == 0 {
            "A".to_string()
        } else if additions == 0 && deletions > 0 {
            "D".to_string()
        } else {
            "M".to_string()
        };
        
        files.push(FileChange {
            path,
            status,
            additions,
            deletions,
        });
    }
    
    Ok(files)
}