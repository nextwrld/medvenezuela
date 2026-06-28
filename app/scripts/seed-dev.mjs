#!/usr/bin/env node
// seed-dev.mjs — Populate 1000 solicitudes + 50 local users for testing.
// Data is Venezuela-specific: estados, hospitales, medicamentos de emergencia.
// Usage: node scripts/seed-dev.mjs
// Requires: DATABASE_URL in .env, MySQL running.

import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set. Copy .env.example to .env first.");
  process.exit(1);
}

// ─── Estados de Venezuela ────────────────────────────────────────
const ESTADOS = [
  "Distrito Capital",
  "Miranda",
  "La Guaira",
  "Carabobo",
  "Aragua",
  "Zulia",
  "Merida",
  "Tachira",
  "Trujillo",
  "Lara",
  "Falcon",
  "Yaracuy",
  "Portuguesa",
  "Barinas",
  "Apure",
  "Guarico",
  "Cojedes",
  "Bolivar",
  "Amazonas",
  "Delta Amacuro",
  "Sucre",
  "Nueva Esparta",
  "Monagas",
  "Anzoategui",
];

// ─── Ciudades principales por estado ─────────────────────────────
const CIUDADES_POR_ESTADO = {
  "Distrito Capital": ["Caracas"],
  Miranda: ["Los Teques", "Guarenas", "Guatire", "Charallave", "Ocumare del Tuy"],
  "La Guaira": ["La Guaira", "Catia La Mar", "Maiquetia", "Naiguata"],
  Carabobo: ["Valencia", "Naguanagua", "Puerto Cabello", "Guacara", "Mariara"],
  Aragua: ["Maracay", "La Victoria", "Turmero", "Cagua", "Villa de Cura"],
  Zulia: ["Maracaibo", "Cabimas", "Ciudad Ojeda", "Bachaquero", "San Francisco"],
  Merida: ["Merida", "Ejido", "Tovar", "El Vigia"],
  Tachira: ["San Cristobal", "Tachira", "Rubio", "Colon"],
  Trujillo: ["Trujillo", "Valera", "Bocono"],
  Lara: ["Barquisimeto", "Cabudare", "Carora", "El Tocuyo"],
  Falcon: ["Coro", "Punto Fijo", "Tucacas", "Chichiriviche"],
  Yaracuy: ["San Felipe", "Yaritagua", "Chivacoa"],
  Portuguesa: ["Guanare", "Acarigua", "Biscucuy"],
  Barinas: ["Barinas", "Socopó", "Ciudad Bolivia"],
  Apure: ["San Fernando", "Achaguas"],
  Guarico: ["San Juan de los Morros", "Calabozo", "Valle de la Pascua"],
  Cojedes: ["San Carlos", "Tinaquillo"],
  Bolivar: ["Ciudad Bolivar", "Ciudad Guayana", "Upata"],
  Amazonas: ["Puerto Ayacucho"],
  "Delta Amacuro": ["Tucupita"],
  Sucre: ["Cumaná", "Carupano", "Guriao"],
  "Nueva Esparta": ["Porlamar", "La Asuncion", "Juan Griego"],
  Monagas: ["Maturin", "Punta de Mata", "Maturin"],
  Anzoategui: ["Barcelona", "Puerto La Cruz", "El Tigre", "Anaco"],
};

// ─── Hospitales venezolanos reales ───────────────────────────────
const HOSPITALES = [
  "Hospital Universitario de Caracas",
  "Hospital Vargas de Caracas",
  "Hospital Miguel Perez Carreño",
  "Hospital Domingo Luciani",
  "Hospital Universitario de Los Andes",
  "Hospital Central de Maracay",
  "Hospital Universitario de Carabobo",
  "Hospital Central de Valencia",
  "Hospital Universitario de Maracaibo",
  "Hospital Universitario de San Cristobal",
  "Hospital Central de Barquisimeto",
  "Hospital Universitario de Merida",
  "Hospital Manuel Noriega Trigo",
  "Hospital Universitario de Tachira",
  "Hospital Pediatrico de Caracas",
  "Hospital de Niños de Maracay",
  "Hospital de Clinicas Caracas",
  "Hospital Militar Carlos Arvelo",
  "Hospital de Emergencias de Coro",
  "Hospital Universitario Antonio Maria Pineda",
  "Hospital Ciudad Hospitalaria Enrique Tejera",
  "Hospital de Especialidades Pediatricas",
  "Hospital Materno Infantil de Carabobo",
  "Hospital Universitario de Puerto Ordaz",
  "Hospital de Niños de Tachira",
  "Hospital Central de Sucre",
  "Hospital Universitario de Monagas",
  "Hospital Universitario de Anzoategui",
  "Hospital de Emergencias de Falcon",
  "Hospital Central de Barinas",
];

// ─── Medicamentos críticos de emergencia en Venezuela ─────────────
const MEDICAMENTOS = [
  ["Amoxicilina", "Amoxicilina"],
  ["Paracetamol", "Acetaminofen"],
  ["Ibuprofeno", "Ibuprofeno"],
  ["Omeprazol", "Omeprazol"],
  ["Losartan", "Losartan potasico"],
  ["Metformina", "Metformina"],
  ["Atorvastatina", "Atorvastatina"],
  ["Salbutamol", "Salbutamol"],
  ["Dexametasona", "Dexametasona"],
  ["Heparina", "Heparina sodica"],
  ["Ketamina", "Ketamina"],
  ["Midazolam", "Midazolam"],
  ["Fentanilo", "Fentanilo"],
  ["Morfina", "Sulfato de morfina"],
  ["Dipirona", "Dipirona"],
  ["Cefazolina", "Cefazolina sodica"],
  ["Vancomicina", "Vancomicina"],
  ["Insulina", "Insulina NPH"],
  ["Enoxaparina", "Enoxaparina sodica"],
  ["Dobutamina", "Dobutamina"],
  ["Suerero", "Cloruro de sodio 0.9%"],
  ["Adrenalina", "Epinefrina"],
  ["Hidrocortisona", "Hidrocortisona"],
  ["KCl", "Cloruro de potasio"],
  ["Ceftriaxona", "Ceftriaxona"],
];

const ROLES = ["medico", "familiar", "personal_salud"];
const URGENCIAS = ["critico", "moderado", "estable"];
const ESTATUS = ["activo", "en_proceso", "recibido"];

const NOMBRES = [
  "Maria", "Jose", "Ana", "Carlos", "Patricia", "Juan", "Laura", "Pedro",
  "Sofia", "Diego", "Lucia", "Martin", "Elena", "Roberto", "Carmen",
  "Fernando", "Valeria", "Andres", "Gabriela", "Ricardo", "Luis", "Rosa",
  "Manuel", "Isabel", "Javier", "Cristina", "Miguel", "Daniela", "Hector",
  "Juliana", "Oscar", "Beatriz", "Raul", "Montserrat", "Gabriel", "Teresa",
];

const APELLIDOS = [
  "Gonzalez", "Rodriguez", "Garcia", "Fernandez", "Lopez", "Martinez",
  "Sanchez", "Perez", "Romero", "Diaz", "Ruiz", "Alvarez", "Acosta",
  "Sosa", "Benitez", "Medina", "Suarez", "Aguirre", "Morales", "Castro",
  "Herrera", "Ramos", "Castillo", "Vargas", "Aguilar", "Mendoza",
  "Jimenez", "Moreno", "Molina", "Cabrera", "Ortega", "Delgado",
  "Pena", "Fuentes", "Navarro", "Rojas",
];

// Estados con alta prioridad por emergencia sísmica
const ZONAS_EMERGENCIA = new Set([
  "La Guaira", "Carabobo", "Aragua", "Miranda", "Distrito Capital",
]);

// ─── Helpers ──────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickEstadoCiudad() {
  const estado = pick(ESTADOS);
  const ciudades = CIUDADES_POR_ESTADO[estado] || [estado];
  return { estado, ciudad: pick(ciudades) };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedUrgencia(estado) {
  // Zonas de emergencia tienen más criticos
  if (ZONAS_EMERGENCIA.has(estado)) {
    const roll = Math.random();
    if (roll < 0.35) return "critico";
    if (roll < 0.70) return "moderado";
    return "estable";
  }
  const roll = Math.random();
  if (roll < 0.15) return "critico";
  if (roll < 0.55) return "moderado";
  return "estable";
}

function weightedEstatus() {
  const roll = Math.random();
  if (roll < 0.45) return "activo";
  if (roll < 0.75) return "en_proceso";
  return "recibido";
}

function genPin() {
  return String(randInt(0, 999999)).padStart(6, "0");
}

function genTelefono() {
  // Telefonos venezolanos: 0XX + XXXXXXX
  const prefijo = "0" + String(randInt(212, 299));
  let tel = prefijo;
  for (let i = 0; i < 7; i++) {
    tel += randInt(0, 9);
  }
  return tel;
}

function randDate(daysBack = 90) {
  const now = Date.now();
  const offset = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

function formatDate(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  console.log("Seeding Venezuela dev data...");
  console.log(`  Estados: ${ESTADOS.length}`);
  console.log(`  Hospitales: ${HOSPITALES.length}`);
  console.log(`  Medicamentos: ${MEDICAMENTOS.length}`);

  // ─── 50 Local Users ─────────────────────────────────────────
  console.log("\nCreating 50 local users...");
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash("test1234", salt);

  const usedUsernames = new Set();
  for (let i = 1; i <= 50; i++) {
    let username = `testuser${i}`;
    while (usedUsernames.has(username)) {
      username = `testuser${i}_${randInt(1, 999)}`;
    }
    usedUsernames.add(username);

    const nombre = pick(NOMBRES);
    const apellido = pick(APELLIDOS);
    const displayName = `${nombre} ${apellido}`;
    const role = i === 1 ? "admin" : pick(["user", "user", "admin"]);

    await conn.execute(
      "INSERT INTO `local_users` (`username`, `passwordHash`, `displayName`, `role`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, NOW(), NOW())",
      [username, hash, displayName, role]
    );
  }
  console.log("  50 local users created (login: testuser1..50, password: test1234)");

  // ─── 1000 Solicitudes ───────────────────────────────────────
  console.log("\nCreating 1000 solicitudes...");
  const usedPins = new Set();

  for (let i = 0; i < 1000; i++) {
    const [medicamento, principio] = pick(MEDICAMENTOS);
    const cantidad = String(randInt(1, 20));
    const dosis = `${randInt(1, 500)}mg`;
    const hospital = pick(HOSPITALES);
    const { estado, ciudad } = pickEstadoCiudad();
    const telefono = genTelefono();
    const nombreSolicitante = `${pick(NOMBRES)} ${pick(APELLIDOS)}`;
    const rolSolicitante = pick(ROLES);
    const inicialesPaciente =
      Math.random() < 0.5
        ? `${pick(NOMBRES)[0]}${pick(APELLIDOS)[0]}`.toUpperCase()
        : null;
    const urgencia = weightedUrgencia(estado);
    const estatus = weightedEstatus();

    let pin = genPin();
    while (usedPins.has(pin)) {
      pin = genPin();
    }
    usedPins.add(pin);

    const notas = Math.random() < 0.3 ? `Nota de prueba #${i + 1}` : null;

    await conn.execute(
      `INSERT INTO \`solicitudes\` (
        \`medicamento\`, \`principioActivo\`, \`cantidad\`, \`dosis\`,
        \`hospital\`, \`estado\`, \`ciudad\`, \`telefono\`,
        \`nombreSolicitante\`, \`rolSolicitante\`, \`inicialesPaciente\`,
        \`urgencia\`, \`estatus\`, \`pinGestion\`, \`notas\`,
        \`createdAt\`, \`updatedAt\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        medicamento,
        principio,
        cantidad,
        dosis,
        hospital,
        estado,
        ciudad,
        telefono,
        nombreSolicitante,
        rolSolicitante,
        inicialesPaciente,
        urgencia,
        estatus,
        pin,
        notas,
        formatDate(randDate()),
        formatDate(new Date()),
      ]
    );

    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/1000...`);
    }
  }

  console.log("\nDone.");
  console.log("  50 local users  (login: testuser1..50, password: test1234)");
  console.log("  1000 solicitudes (Venezuela-specific data)");
  console.log("  Estados: 24 estados cubiertos");
  console.log("  Hospitales: 30 hospitales venezolanos reales");
  console.log("  Zonas de emergencia: 5 estados (mas proporcion de criticos)");
  console.log("\nLogin with testuser1 / test1234 to test the app.");

  await conn.end();
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});