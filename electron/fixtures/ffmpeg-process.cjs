const fs = require("node:fs"), { spawn } = require("node:child_process");
const args = process.argv.slice(2), output = args.at(-1);
fs.writeFileSync(output + ".argv.json", JSON.stringify(args));
fs.writeFileSync(output + ".pid", String(process.pid));
if (args.includes("--tree")) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  fs.writeFileSync(output + ".tree.json", JSON.stringify({ parent: process.pid, child: child.pid }));
}
const log = Buffer.from("编码启动\r\n");
process.stderr.write(log.subarray(0, 2));
setTimeout(() => {
  process.stderr.write(log.subarray(2));
  process.stdout.write("out_time=00:00:01.");
  setTimeout(() => {
    process.stdout.write("500\nspeed=2.0x\nbitrate=128kbits/s\nprogress=continue\n");
    if (args.includes("--hold") || args.includes("--tree")) { setInterval(() => {}, 1000); return; }
    if (args.includes("--fail")) { process.stderr.write("controlled encoder failure\n"); process.exitCode = 7; return; }
    fs.writeFileSync(output, "converted media fixture");
  }, 10);
}, 10);
