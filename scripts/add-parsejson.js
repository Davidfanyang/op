const fs = require("fs");
const path = "/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-evaluation-repository.js";

let content = fs.readFileSync(path, "utf8");

if (!content.includes("const parseJson = ")) {
  content = content.replace(
    "if (!row) return null;",
    "if (!row) return null;\n    \n    // MySQL 9.x + mysql2 驱动会自动解析 JSON 字段\n    const parseJson = (v, defaultValue) => {\n      if (!v) return defaultValue;\n      if (typeof v === \"object\") return v;\n      try { return JSON.parse(v); } catch { return defaultValue; }\n    };"
  );
  fs.writeFileSync(path, content);
  console.log("parseJson function added");
} else {
  console.log("parseJson already exists");
}
