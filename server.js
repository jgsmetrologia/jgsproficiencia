require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1);

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "jgs_proficiencia";

if (!MONGODB_URI) {
  console.error(
    "ERRO: variável de ambiente MONGODB_URI não definida. Configure-a no Render em Environment."
  );
}

let db = null;
let mongoClient = null;

async function connectToMongo() {
  if (db) return db;

  mongoClient = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await mongoClient.connect();

  db = mongoClient.db(MONGODB_DB);

  console.log("Conectado ao MongoDB Atlas, banco:", MONGODB_DB);

  return db;
}

app.use(express.json({ limit: "2mb" }));
const pdfUploadParser = express.raw({ type: "application/pdf", limit: "15mb" });
function parsePdfUpload(req, res, next) {
  pdfUploadParser(req, res, (err) => {
    if (err) {
      console.error("Erro ao receber PDF da rodada:", err);
      return res.status(err.status === 413 ? 413 : 400).json({
        ok: false,
        error: err.status === 413
          ? "O PDF deve ter no máximo 15 MB."
          : "Não foi possível receber o arquivo PDF.",
      });
    }
    next();
  });
}

function sanitizePdfFilename(value) {
  const basename = path.basename(String(value || "").replace(/\\/g, "/"));
  let filename = basename
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  if (!filename || filename === ".") filename = "resultados.pdf";
  if (!filename.toLowerCase().endsWith(".pdf")) filename += ".pdf";
  return filename;
}

async function deleteGridFsFile(bucket, fileId) {
  if (!fileId || !ObjectId.isValid(String(fileId))) return;
  const objectId = new ObjectId(String(fileId));
  const files = await bucket.find({ _id: objectId }).limit(1).toArray();
  if (files.length) await bucket.delete(objectId);
}
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/site", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/resultados", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rodadas.html"));
});
app.get("/meus-ensaios", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "meus-ensaios.html"));
});
app.get("/ensaio", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rodada-form.html"));
});
app.get("/public/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/formulario", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rodadas.html"));
});
app.get("/form", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rodadas.html"));
});
app.use(express.static(path.join(__dirname, "public")));
app.get("/site.css", (req, res) => {
  res.type("text/css");
  res.sendFile(path.join(__dirname, "site.css"));
});

app.get("/logo.png", (req, res) => {
  res.type("image/png");
  res.sendFile(path.join(__dirname, "logo.png"));
});

app.get("/rodada.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "public", "rodada.js"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin_index.html"));
});
function generateTempPassword(len = 8) {
  const alphabet =
    "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

  let out = "";

  for (let i = 0; i < len; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }

  return out;
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function parseRodadaItens(itensRaw) {
  const arr = Array.isArray(itensRaw) ? itensRaw : [];

  return arr
    .map((it) => {
      const pontos = Array.isArray(it && it.pontos)
        ? it.pontos.map((ponto) => {
            if (typeof ponto === "string") {
              return { nome: ponto.trim(), opcoes: [] };
            }
            return {
              nome: String((ponto && ponto.nome) || "").trim(),
              opcoes: parseRodadaOpcoes(ponto && ponto.opcoes),
            };
          }).filter((ponto) => ponto.nome)
        : String((it && it.pontos) || "")
            .split(",")
            .map((nome) => ({ nome: nome.trim(), opcoes: [] }))
            .filter((ponto) => ponto.nome);

      return {
        titulo: String((it && it.titulo) || "").trim(),
        descricao: String((it && it.descricao) || "").trim(),
        opcoes: parseRodadaOpcoes(it && it.opcoes),
        pontos,
      };
    })
    .filter((it) => it.titulo);
}

function parseRodadaOpcoes(opcoesRaw) {
  const source = Array.isArray(opcoesRaw)
    ? opcoesRaw
    : String(opcoesRaw || "")
        .split(/\r?\n/)
        .map((linha) => {
          const [nome, tipo, unidade] = linha.split("|").map((part) => part.trim());
          return { nome, tipo, unidade };
        });

  return source
    .map((opcao) => ({
      nome: String((opcao && (opcao.nome || opcao.label)) || "").trim(),
      tipo: String((opcao && opcao.tipo) || "texto").trim().toLowerCase() === "número"
        ? "numero"
        : String((opcao && opcao.tipo) || "texto").trim().toLowerCase() === "numero"
          ? "numero"
          : "texto",
      unidade: String((opcao && opcao.unidade) || "").trim(),
          repetir: opcao && opcao.repetir !== false,
    }))
    .filter((opcao) => opcao.nome);
}

function parseRodadaIds(idsRaw) {
  if (!Array.isArray(idsRaw)) return [];

  return idsRaw
    .map((id) => String(id || "").trim())
    .filter((id) => ObjectId.isValid(id))
    .map((id) => id.toLowerCase());
}

async function requireClient(req, res, next) {
  try {
    const token = req.headers["x-client-token"];

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado.",
      });
    }

    const database = await connectToMongo();

    const client = await database.collection("clients").findOne({
      activeToken: token,
      active: true,
    });

    if (!client) {
      return res.status(401).json({
        ok: false,
        error: "Sessão inválida ou expirada. Faça login novamente.",
      });
    }

    req.client = client;

    next();
  } catch (err) {
    console.error("Erro na autenticação do cliente:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno de autenticação.",
    });
  }
}

app.post("/api/client/login", async (req, res) => {
  try {
    const username = normalizeUsername(
      req.body && req.body.username
    );

    const password = (req.body && req.body.password) || "";

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        error: "Informe usuário e senha.",
      });
    }

    const database = await connectToMongo();

    const client = await database
      .collection("clients")
      .findOne({ username });

    if (!client || !client.active) {
      return res.status(401).json({
        ok: false,
        error: "Usuário ou senha inválidos.",
      });
    }

    const match = await bcrypt.compare(
      password,
      client.passwordHash
    );

    if (!match) {
      return res.status(401).json({
        ok: false,
        error: "Usuário ou senha inválidos.",
      });
    }

    const token = generateToken();

    await database.collection("clients").updateOne(
      { _id: client._id },
      {
        $set: {
          activeToken: token,
          tokenCreatedAt: new Date(),
        },
      }
    );

    res.status(200).json({
      ok: true,
      token,
      nome: client.nome || client.username,
      mustChangePassword: !!client.mustChangePassword,
    });
  } catch (err) {
    console.error("Erro no login do cliente:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao efetuar login.",
    });
  }
});

app.get("/api/client/me", requireClient, (req, res) => {
  res.status(200).json({
    ok: true,
    username: req.client.username,
    nome: req.client.nome || req.client.username,
    mustChangePassword: !!req.client.mustChangePassword,
  });
});

app.post(
  "/api/client/change-password",
  requireClient,
  async (req, res) => {
    try {
      const newPassword =
        (req.body && req.body.newPassword) || "";

      if (newPassword.length < 6) {
        return res.status(400).json({
          ok: false,
          error: "A nova senha deve ter pelo menos 6 caracteres.",
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const newToken = generateToken();

      const database = await connectToMongo();

      await database.collection("clients").updateOne(
        { _id: req.client._id },
        {
          $set: {
            passwordHash,
            mustChangePassword: false,
            activeToken: newToken,
            tokenCreatedAt: new Date(),
          },
        }
      );

      res.status(200).json({
        ok: true,
        token: newToken,
      });
    } catch (err) {
      console.error("Erro ao trocar senha do cliente:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao trocar a senha.",
      });
    }
  }
);

app.post("/api/client/logout", requireClient, async (req, res) => {
  try {
    const database = await connectToMongo();

    await database.collection("clients").updateOne(
      { _id: req.client._id },
      {
        $set: {
          activeToken: null,
        },
      }
    );

    res.status(200).json({
      ok: true,
    });
  } catch (err) {
    console.error("Erro ao sair:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao sair.",
    });
  }
});

app.post("/api/save-results", requireClient, async (req, res) => {
  try {
    if (req.client.mustChangePassword) {
      return res.status(403).json({
        ok: false,
        error:
          "Defina sua senha definitiva antes de enviar resultados.",
      });
    }

    const { codigo, fields, rows } = req.body || {};

    if (!codigo) {
      return res.status(400).json({
        ok: false,
        error: 'Campo "codigo" é obrigatório.',
      });
    }

    const database = await connectToMongo();
    const collection = database.collection("submissions");
    const requestedRodadaId = String((req.body && req.body.rodadaId) || "").trim();

    const doc = {
      codigo,
      fields: fields || {},
      rows: rows || [],
      rodadaId: null,
      rodadaNome: null,
      clientUsername: req.client.username,
      clientNome: req.client.nome || req.client.username,
      createdAt: new Date(),
      userAgent: req.headers["user-agent"] || null,
    };
    if (requestedRodadaId) {
      if (!ObjectId.isValid(requestedRodadaId)) {
        return res.status(400).json({ ok: false, error: "Rodada inválida." });
      }
      const normalizedRodadaId = requestedRodadaId.toLowerCase();

      const database = await connectToMongo();
      const rodada = await database.collection("rodadas").findOne({
        _id: new ObjectId(normalizedRodadaId),
      });

      if (!rodada) {
        return res.status(404).json({ ok: false, error: "Rodada não encontrada ou inativa." });
      }

      if (Array.isArray(req.client.rodadaIds) && !req.client.rodadaIds.includes(normalizedRodadaId)) {
        return res.status(403).json({ ok: false, error: "Você não está inscrito nesta rodada." });
      }

      if (rodada.finalizada === true) {
        return res.status(403).json({
          ok: false,
          error: "Este ensaio já foi finalizado e não aceita novos envios.",
        });
      }

      if (rodada.ativo !== true) {
        return res.status(404).json({ ok: false, error: "Rodada não encontrada ou inativa." });
      }

      doc.rodadaId = normalizedRodadaId;
      doc.rodadaNome = rodada.nome;
    }

    const submissionFilter = {
      codigo,
      clientUsername: req.client.username,
      ...(doc.rodadaId ? { rodadaId: doc.rodadaId } : {}),
    };

    const result = await collection.updateOne(
      submissionFilter,
      { $set: doc },
      { upsert: true }
    );

    return res.status(200).json({
      ok: true,
      codigo,
      upsertedId: result.upsertedId || null,
      updated: result.matchedCount > 0,
    });
  } catch (err) {
    console.error("Erro ao salvar no MongoDB:", err);

    return res.status(500).json({
      ok: false,
      error: "Erro interno ao salvar os dados.",
    });
  }
});

app.get("/api/health", (req, res) =>
  res.status(200).json({ ok: true })
);
app.get("/api/rodadas", async (req, res) => {
  try {
    const database = await connectToMongo();

    const docs = await database
      .collection("rodadas")
      .find(
        { ativo: true, finalizada: { $ne: true } },
        { projection: { resultadoPdf: 0 } }
      )
      .sort({ createdAt: 1 })
      .toArray();

    res.status(200).json({
      ok: true,
      rodadas: docs,
    });
  } catch (err) {
    console.error("Erro ao buscar as rodadas ativas:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao buscar as rodadas.",
    });
  }
});

app.get("/api/rodadas/finalizadas", async (req, res) => {
  try {
    const database = await connectToMongo();
    const docs = await database.collection("rodadas")
      .find(
        { finalizada: true },
        { projection: { _id: 0, nome: 1, "itens.titulo": 1, finalizadaEm: 1 } }
      )
      .sort({ finalizadaEm: -1 })
      .toArray();

    res.status(200).json({
      ok: true,
      rodadas: docs.map((rodada) => ({
        nome: rodada.nome,
        itens: (rodada.itens || []).map((item) => item.titulo),
        finalizadaEm: rodada.finalizadaEm || null,
      })),
    });
  } catch (err) {
    console.error("Erro ao buscar as rodadas finalizadas:", err);
    res.status(500).json({
      ok: false,
      error: "Erro interno ao buscar os ensaios realizados.",
    });
  }
});

app.get("/api/client/rodadas", requireClient, async (req, res) => {
  try {
    const database = await connectToMongo();
    const assignedIds = Array.isArray(req.client.rodadaIds)
      ? parseRodadaIds(req.client.rodadaIds)
      : [];
    const filter = {
      _id: { $in: assignedIds.map((id) => new ObjectId(id)) },
      $or: [{ ativo: true }, { finalizada: true }],
    };

    const docs = await database
      .collection("rodadas")
      .find(filter)
      .sort({ createdAt: 1 })
      .toArray();

    res.status(200).json({
      ok: true,
      rodadas: docs.map((rodada) => ({
        _id: rodada._id,
        nome: rodada.nome,
        descricaoCta: rodada.descricaoCta,
        itens: rodada.itens || [],
        ativo: rodada.ativo,
        finalizada: rodada.finalizada === true,
        finalizadaEm: rodada.finalizadaEm || null,
        temResultado: !!(rodada.resultadoPdf && rodada.resultadoPdf.fileId),
      })),
    });
  } catch (err) {
    console.error("Erro ao buscar rodadas do cliente:", err);
    res.status(500).json({ ok: false, error: "Erro interno ao buscar suas rodadas." });
  }
});

app.get("/api/client/rodadas/:id/resultado", requireClient, async (req, res) => {
  try {
    const rodadaId = req.params.id.toLowerCase();
    if (!ObjectId.isValid(rodadaId)) {
      return res.status(400).json({ ok: false, error: "ID de rodada inválido." });
    }

    const assignedIds = Array.isArray(req.client.rodadaIds)
      ? parseRodadaIds(req.client.rodadaIds)
      : [];
    if (!assignedIds.includes(rodadaId)) {
      return res.status(403).json({ ok: false, error: "Você não está inscrito nesta rodada." });
    }

    const database = await connectToMongo();
    const rodada = await database.collection("rodadas").findOne({
      _id: new ObjectId(rodadaId),
    });
    if (!rodada) {
      return res.status(404).json({ ok: false, error: "Rodada não encontrada." });
    }
    if (rodada.finalizada !== true) {
      return res.status(403).json({ ok: false, error: "O resultado estará disponível após a finalização do ensaio." });
    }
    if (!rodada.resultadoPdf || !rodada.resultadoPdf.fileId) {
      return res.status(404).json({ ok: false, error: "O PDF de resultados ainda não foi publicado." });
    }

    const bucket = new GridFSBucket(database, { bucketName: "resultados" });
    const fileId = new ObjectId(String(rodada.resultadoPdf.fileId));
    const files = await bucket.find({ _id: fileId }).limit(1).toArray();
    if (!files.length) {
      return res.status(404).json({ ok: false, error: "Arquivo de resultados não encontrado." });
    }

    const filename = sanitizePdfFilename(rodada.resultadoPdf.nome);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on("error", (err) => {
      console.error("Erro ao transmitir PDF de resultados ao cliente:", err);
      if (res.headersSent) res.destroy(err);
      else res.status(500).json({ ok: false, error: "Erro ao transmitir o PDF de resultados." });
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error("Erro ao buscar PDF de resultados do cliente:", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "Erro interno ao buscar o PDF de resultados." });
    }
  }
});

app.get(
  "/api/client/submissions",
  requireClient,
  async (req, res) => {
    try {
      const database = await connectToMongo();

      const docs = await database
        .collection("submissions")
        .find(
          { clientUsername: req.client.username },
          {
            projection: {
              codigo: 1,
              createdAt: 1,
              clientNome: 1,
              rodadaId: 1,
              rodadaNome: 1,
              "fields.tecnico_nome": 1,
              "fields.data_calibracao": 1,
            },
          }
        )
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        ok: true,
        submissions: docs,
      });
    } catch (err) {
      console.error(
        "Erro ao listar os envios do cliente:",
        err
      );

      res.status(500).json({
        ok: false,
        error: "Erro interno ao listar os envios.",
      });
    }
  }
);

app.get(
  "/api/client/submissions/:codigo",
  requireClient,
  async (req, res) => {
    try {
      const database = await connectToMongo();

      const doc = await database
        .collection("submissions")
        .findOne({
          codigo: req.params.codigo,
          clientUsername: req.client.username,
        });

      if (!doc) {
        return res.status(404).json({
          ok: false,
          error: "Envio não encontrado.",
        });
      }

      res.status(200).json({
        ok: true,
        submission: doc,
      });
    } catch (err) {
      console.error(
        "Erro ao buscar o envio do cliente:",
        err
      );

      res.status(500).json({
        ok: false,
        error: "Erro interno ao buscar o envio.",
      });
    }
  }
);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "JgsAdm";

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({
      ok: false,
      error:
        "ADMIN_PASSWORD não configurada no servidor.",
    });
  }

  const sent = req.headers["x-admin-password"];

  if (!sent || sent !== ADMIN_PASSWORD) {
    return res.status(401).json({
      ok: false,
      error: "Senha inválida.",
    });
  }

  next();
}

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({
      ok: false,
      error:
        "ADMIN_PASSWORD não configurada no servidor.",
    });
  }

  const { username, password } = req.body || {};

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.status(200).json({
      ok: true,
    });
  }

  return res.status(401).json({
    ok: false,
    error: "Usuário ou senha incorretos.",
  });
});

app.get(
  "/api/admin/submissions",
  requireAdmin,
  async (req, res) => {
    try {
      const database = await connectToMongo();

      const docs = await database
        .collection("submissions")
        .find(
          {},
          {
            projection: {
              codigo: 1,
              createdAt: 1,
              clientUsername: 1,
              clientNome: 1,
              rodadaId: 1,
              rodadaNome: 1,
              "fields.tecnico_nome": 1,
              "fields.data_calibracao": 1,
            },
          }
        )
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        ok: true,
        submissions: docs,
      });
    } catch (err) {
      console.error("Erro ao listar envios:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao listar os envios.",
      });
    }
  }
);

app.get(
  "/api/admin/submissions/:codigo",
  requireAdmin,
  async (req, res) => {
    try {
      const database = await connectToMongo();

      const doc = await database
        .collection("submissions")
        .findOne({
          codigo: req.params.codigo,
        });

      if (!doc) {
        return res.status(404).json({
          ok: false,
          error: "Envio não encontrado.",
        });
      }

      res.status(200).json({
        ok: true,
        submission: doc,
      });
    } catch (err) {
      console.error("Erro ao buscar envio:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao buscar o envio.",
      });
    }
  }
);

app.delete(
  "/api/admin/submissions/:codigo",
  requireAdmin,
  async (req, res) => {
    try {
      const database = await connectToMongo();

      const result = await database
        .collection("submissions")
        .deleteOne({
          codigo: req.params.codigo,
        });

      if (!result.deletedCount) {
        return res.status(404).json({
          ok: false,
          error: "Envio não encontrado.",
        });
      }

      res.status(200).json({
        ok: true,
      });
    } catch (err) {
      console.error("Erro ao excluir envio:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao excluir o envio.",
      });
    }
  }
);

app.get(
  "/api/admin/clients",
  requireAdmin,
  async (req, res) => {
    try {
      const database = await connectToMongo();

      const docs = await database
        .collection("clients")
        .find(
          {},
          {
            projection: {
              passwordHash: 0,
              activeToken: 0,
            },
          }
        )
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        ok: true,
        clients: docs,
      });
    } catch (err) {
      console.error("Erro ao listar clientes:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao listar os clientes.",
      });
    }
  }
);

app.post(
  "/api/admin/clients",
  requireAdmin,
  async (req, res) => {
    try {
      const username = normalizeUsername(
        req.body && req.body.username
      );

      const nome =
        req.body && req.body.nome
          ? String(req.body.nome).trim()
          : "";

      if (!username) {
        return res.status(400).json({
          ok: false,
          error: "Informe um nome de usuário.",
        });
      }

      const database = await connectToMongo();

      const existing = await database
        .collection("clients")
        .findOne({ username });

      if (existing) {
        return res.status(409).json({
          ok: false,
          error:
            "Já existe um cliente com esse usuário.",
        });
      }

      const tempPassword = generateTempPassword();

      const passwordHash = await bcrypt.hash(
        tempPassword,
        10
      );

      const doc = {
        username,
        nome,
        rodadaIds: [],
        passwordHash,
        mustChangePassword: true,
        active: true,
        activeToken: null,
        tokenCreatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await database
        .collection("clients")
        .insertOne(doc);

      res.status(201).json({
        ok: true,
        username,
        tempPassword,
      });
    } catch (err) {
      console.error("Erro ao criar cliente:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao criar o cliente.",
      });
    }
  }
);

app.put(
  "/api/admin/clients/:username",
  requireAdmin,
  async (req, res) => {
    try {
      const username = normalizeUsername(
        req.params.username
      );

      const database = await connectToMongo();

      const client = await database
        .collection("clients")
        .findOne({ username });

      if (!client) {
        return res.status(404).json({
          ok: false,
          error: "Cliente não encontrado.",
        });
      }

      const update = {
        updatedAt: new Date(),
      };

      let tempPassword = null;

      if (typeof req.body.nome === "string") {
        update.nome = req.body.nome.trim();
      }

      if (typeof req.body.active === "boolean") {
        update.active = req.body.active;
      }

      if (Array.isArray(req.body.rodadaIds)) {
        update.rodadaIds = parseRodadaIds(req.body.rodadaIds);
      }

      if (req.body.resetPassword) {
        tempPassword = generateTempPassword();

        update.passwordHash = await bcrypt.hash(
          tempPassword,
          10
        );

        update.mustChangePassword = true;
        update.activeToken = null;
      }

      await database.collection("clients").updateOne(
        { _id: client._id },
        { $set: update }
      );

      res.status(200).json({
        ok: true,
        tempPassword,
      });
    } catch (err) {
      console.error("Erro ao editar cliente:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao editar o cliente.",
      });
    }
  }
);

app.delete(
  "/api/admin/clients/:username",
  requireAdmin,
  async (req, res) => {
    try {
      const username = normalizeUsername(
        req.params.username
      );

      const database = await connectToMongo();

      const result = await database
        .collection("clients")
        .deleteOne({ username });

      if (!result.deletedCount) {
        return res.status(404).json({
          ok: false,
          error: "Cliente não encontrado.",
        });
      }

      res.status(200).json({
        ok: true,
      });
    } catch (err) {
      console.error("Erro ao excluir cliente:", err);

      res.status(500).json({
        ok: false,
        error: "Erro interno ao excluir o cliente.",
      });
    }
  }
);

app.get("/api/admin/rodadas", requireAdmin, async (req, res) => {
  try {
    const database = await connectToMongo();

    const docs = await database
      .collection("rodadas")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      ok: true,
      rodadas: docs,
    });
  } catch (err) {
    console.error("Erro ao listar as rodadas (admin):", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao listar as rodadas.",
    });
  }
});

app.post("/api/admin/rodadas", requireAdmin, async (req, res) => {
  try {
    const nome =
      req.body && typeof req.body.nome === "string"
        ? req.body.nome.trim()
        : "";

    const descricaoCta =
      req.body && typeof req.body.descricaoCta === "string"
        ? req.body.descricaoCta.trim()
        : "";

    const ativo =
      req.body && typeof req.body.ativo === "boolean"
        ? req.body.ativo
        : true;

    const itens = parseRodadaItens(req.body && req.body.itens);

    if (!nome) {
      return res.status(400).json({
        ok: false,
        error: "Informe o nome da rodada.",
      });
    }

    if (!itens.length) {
      return res.status(400).json({
        ok: false,
        error: "Adicione ao menos um item/equipamento da rodada.",
      });
    }

    const database = await connectToMongo();

    const doc = {
      nome,
      descricaoCta,
      itens,
      ativo,
      finalizada: false,
      finalizadaEm: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await database.collection("rodadas").insertOne(doc);

    res.status(201).json({
      ok: true,
      rodada: { ...doc, _id: result.insertedId },
    });
  } catch (err) {
    console.error("Erro ao criar rodada:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao criar a rodada.",
    });
  }
});

app.put("/api/admin/rodadas/:id", requireAdmin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        ok: false,
        error: "ID de rodada inválido.",
      });
    }
    const objectId = new ObjectId(req.params.id);

    const database = await connectToMongo();

    const existing = await database
      .collection("rodadas")
      .findOne({ _id: objectId });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "Rodada não encontrada.",
      });
    }

    const update = { updatedAt: new Date() };

    if (typeof req.body.nome === "string") {
      const nome = req.body.nome.trim();

      if (!nome) {
        return res.status(400).json({
          ok: false,
          error: "Informe o nome da rodada.",
        });
      }

      update.nome = nome;
    }

    if (typeof req.body.descricaoCta === "string") {
      update.descricaoCta = req.body.descricaoCta.trim();
    }

    if (typeof req.body.ativo === "boolean") {
      update.ativo = req.body.ativo;
    }

    if (typeof req.body.finalizada === "boolean") {
      update.finalizada = req.body.finalizada;
      update.finalizadaEm = req.body.finalizada
        ? existing.finalizadaEm || new Date()
        : null;
    }

    if (Array.isArray(req.body.itens)) {
      const itens = parseRodadaItens(req.body.itens);

      if (!itens.length) {
        return res.status(400).json({
          ok: false,
          error: "Adicione ao menos um item/equipamento da rodada.",
        });
      }

      update.itens = itens;
    }

    await database
      .collection("rodadas")
      .updateOne({ _id: objectId }, { $set: update });

    const updated = await database
      .collection("rodadas")
      .findOne({ _id: objectId });

    res.status(200).json({
      ok: true,
      rodada: updated,
    });
  } catch (err) {
    console.error("Erro ao editar rodada:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao editar a rodada.",
    });
  }
});

app.post(
  "/api/admin/rodadas/:id/resultado",
  requireAdmin,
  parsePdfUpload,
  async (req, res) => {
    try {
      const rodadaId = req.params.id;
      if (!ObjectId.isValid(rodadaId)) {
        return res.status(400).json({ ok: false, error: "ID de rodada inválido." });
      }

      const contentType = String(req.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (contentType !== "application/pdf") {
        return res.status(415).json({ ok: false, error: "Envie um arquivo com Content-Type application/pdf." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ ok: false, error: "O arquivo PDF está vazio ou não foi enviado." });
      }
      if (req.body.length > 15 * 1024 * 1024) {
        return res.status(413).json({ ok: false, error: "O PDF deve ter no máximo 15 MB." });
      }
      if (req.body.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return res.status(400).json({ ok: false, error: "O arquivo enviado não é um PDF válido." });
      }

      const database = await connectToMongo();
      const objectId = new ObjectId(rodadaId);
      const collection = database.collection("rodadas");
      const rodada = await collection.findOne({ _id: objectId });
      if (!rodada) {
        return res.status(404).json({ ok: false, error: "Rodada não encontrada." });
      }

      const filename = sanitizePdfFilename(req.headers["x-filename"]);
      const bucket = new GridFSBucket(database, { bucketName: "resultados" });
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: { rodadaId: objectId },
      });
      const uploaded = new Promise((resolve, reject) => {
        uploadStream.once("error", reject);
        uploadStream.once("finish", resolve);
      });
      uploadStream.end(req.body);
      await uploaded;

      const resultadoPdf = {
        fileId: uploadStream.id,
        nome: filename,
        tamanho: req.body.length,
        enviadoEm: new Date(),
      };
      await collection.updateOne(
        { _id: objectId },
        { $set: { resultadoPdf, updatedAt: new Date() } }
      );

      if (rodada.resultadoPdf && rodada.resultadoPdf.fileId) {
        await deleteGridFsFile(bucket, rodada.resultadoPdf.fileId);
      }

      return res.status(200).json({ ok: true, resultadoPdf: {
        nome: resultadoPdf.nome,
        tamanho: resultadoPdf.tamanho,
        enviadoEm: resultadoPdf.enviadoEm,
      } });
    } catch (err) {
      console.error("Erro ao enviar PDF de resultados da rodada:", err);
      return res.status(500).json({ ok: false, error: "Erro interno ao enviar o PDF de resultados." });
    }
  }
);

app.delete("/api/admin/rodadas/:id/resultado", requireAdmin, async (req, res) => {
  try {
    const rodadaId = req.params.id;
    if (!ObjectId.isValid(rodadaId)) {
      return res.status(400).json({ ok: false, error: "ID de rodada inválido." });
    }
    const database = await connectToMongo();
    const collection = database.collection("rodadas");
    const objectId = new ObjectId(rodadaId);
    const rodada = await collection.findOne({ _id: objectId });
    if (!rodada) {
      return res.status(404).json({ ok: false, error: "Rodada não encontrada." });
    }
    if (rodada.resultadoPdf && rodada.resultadoPdf.fileId) {
      const bucket = new GridFSBucket(database, { bucketName: "resultados" });
      await deleteGridFsFile(bucket, rodada.resultadoPdf.fileId);
    }
    await collection.updateOne(
      { _id: objectId },
      { $unset: { resultadoPdf: "" }, $set: { updatedAt: new Date() } }
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erro ao remover PDF de resultados da rodada:", err);
    return res.status(500).json({ ok: false, error: "Erro interno ao remover o PDF de resultados." });
  }
});

app.get("/api/admin/rodadas/:id/resultado", requireAdmin, async (req, res) => {
  try {
    const rodadaId = req.params.id;
    if (!ObjectId.isValid(rodadaId)) {
      return res.status(400).json({ ok: false, error: "ID de rodada inválido." });
    }
    const database = await connectToMongo();
    const rodada = await database.collection("rodadas").findOne({
      _id: new ObjectId(rodadaId),
    });
    if (!rodada) {
      return res.status(404).json({ ok: false, error: "Rodada não encontrada." });
    }
    if (!rodada.resultadoPdf || !rodada.resultadoPdf.fileId) {
      return res.status(404).json({ ok: false, error: "Esta rodada ainda não possui PDF de resultados." });
    }

    const bucket = new GridFSBucket(database, { bucketName: "resultados" });
    const fileId = new ObjectId(String(rodada.resultadoPdf.fileId));
    const files = await bucket.find({ _id: fileId }).limit(1).toArray();
    if (!files.length) {
      return res.status(404).json({ ok: false, error: "Arquivo de resultados não encontrado." });
    }
    const filename = sanitizePdfFilename(rodada.resultadoPdf.nome);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on("error", (err) => {
      console.error("Erro ao transmitir PDF de resultados ao admin:", err);
      if (res.headersSent) res.destroy(err);
      else res.status(500).json({ ok: false, error: "Erro ao transmitir o PDF de resultados." });
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error("Erro ao buscar PDF de resultados da rodada (admin):", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "Erro interno ao buscar o PDF de resultados." });
    }
  }
});

app.delete("/api/admin/rodadas/:id", requireAdmin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        ok: false,
        error: "ID de rodada inválido.",
      });
    }

    const database = await connectToMongo();
    const objectId = new ObjectId(req.params.id);
    const rodada = await database.collection("rodadas").findOne({ _id: objectId });
    if (!rodada) {
      return res.status(404).json({
        ok: false,
        error: "Rodada não encontrada.",
      });
    }
    if (rodada.resultadoPdf && rodada.resultadoPdf.fileId) {
      const bucket = new GridFSBucket(database, { bucketName: "resultados" });
      await deleteGridFsFile(bucket, rodada.resultadoPdf.fileId);
    }

    const result = await database
      .collection("rodadas")
      .deleteOne({ _id: objectId });

    if (!result.deletedCount) {
      return res.status(404).json({
        ok: false,
        error: "Rodada não encontrada.",
      });
    }

    res.status(200).json({
      ok: true,
    });
  } catch (err) {
    console.error("Erro ao excluir rodada:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao excluir a rodada.",
    });
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      error: "Rota não encontrada.",
    });
  }

  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`http://26.83.139.199:${PORT} Tambem tá`);
  connectToMongo().catch((err) =>
    console.error(
      "Falha ao conectar no MongoDB na inicialização:",
      err
    )
  );
});
