with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

helper_code = """
async function callAiAgentPrompt(promptText, maxRetries = 2) {
  const { spawn } = await import("child_process");
  let attempt = 0;
  while (attempt <= maxRetries) {
    console.log(`[AI AGENT] Routing prompt to Antigravity CLI (agy -p) [Attempt ${attempt + 1}/${maxRetries + 1}]...`);
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn("agy", ["--print-timeout", "5m", "-p", promptText]);
        let stdout = "";
        let stderr = "";
        const timeoutId = setTimeout(() => {
          child.kill();
          reject(new Error("Antigravity CLI (agy) request timed out."));
        }, 120000); // 2 minutes timeout

        child.stdout.on("data", (data) => { stdout += data.toString(); });
        child.stderr.on("data", (data) => { stderr += data.toString(); });

        child.on("close", (code) => {
          clearTimeout(timeoutId);
          if (code === 0 && stdout.trim()) {
            resolve(stdout);
          } else {
            reject(new Error(stderr || `agy process exited with code ${code}`));
          }
        });
        child.on("error", (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });
      console.log("[AI AGENT] Antigravity CLI (agy) executed successfully.");
      return result;
    } catch (err) {
      console.warn(`[AI AGENT WARN] Attempt ${attempt + 1} failed: ${err.message}`);
      attempt++;
      if (attempt > maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
"""

target = "async function fetchGeminiWithRetry"
if target in content and "async function callAiAgentPrompt" not in content:
    content = content.replace(target, helper_code + "\n\n" + target)
    print("SUCCESS: Inserted callAiAgentPrompt helper into server.js")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
