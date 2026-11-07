const fs = require("fs");
const path = "C:/Users/HomePC/Documents/antigravity/amazing-pascal/ziki-repo/app/(app)/layout.tsx";
let content = fs.readFileSync(path, "utf8");
content = content.replace(/\s*\n\s*\n\s*\n\s*\n\s*\n\s*\n\s*\/\/ Earn \(#earn-drafts\)/, "\n\n  // Earn (#earn-drafts)");
fs.writeFileSync(path, content, "utf8");
console.log("Cleaned layout.tsx blank lines");
