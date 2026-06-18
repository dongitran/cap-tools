# ⚡ SAP Tools

> Run SAP BTP work from one focused Visual Studio Code workspace.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/dongtran.sap-tools?label=VS%20Marketplace&logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=dongtran.sap-tools)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![VS Code](https://img.shields.io/badge/vscode-%5E1.90.0-007ACC?logo=visual-studio-code)](https://code.visualstudio.com)

---

## 😩 The Problem

Working with SAP BTP on Cloud Foundry means switching context all day:

- Picking the right region, org, and space before doing anything useful
- Opening logs, APIs, Event Mesh tools, and HANA checks in separate places
- Repeating the same client-binding and topic selections across many apps
- Rebuilding local packages, exporting artifacts, and checking runtime state by hand

**SAP Tools** makes SAP BTP work easier by removing those small context switches.

---

## 🚀 What It Does

A Visual Studio Code panel connects to your SAP BTP landscape and gives you one place to:

1. Select a region, org, and space
2. Open an app's logs, APIs, Event Mesh tools, and HANA SQL workflow
3. Subscribe, publish, inspect, export, and rebuild without losing the active app context

---

## ✨ Features

- 🗺️ **Region / Org / Space Picker** — move through SAP BTP scopes without terminal hopping
- 🔎 **Quick Org Search** — find the right org fast in large landscapes
- 📡 **Log-API-Event Workspace** — open logs, APIs, subscribe, and publish tools from an app
- 🧵 **Event Mesh Subscribe Simple** — group similar bindings and listen with fewer clicks
- 🎛️ **Event Mesh Subscribe Advanced** — choose exact bindings, topics, and queue behavior
- 📨 **Event Mesh Publish** — publish by topic or directly to a queue when supported
- 🧯 **CF Logs Panel** — stream, filter, pause, and optionally write logs to files
- 🧠 **HANA SQL Workbench** — run app-scoped SQL, discover tables, and export results
- 📦 **Local Package Publish** — build and publish local packages through a managed registry
- 🗂️ **Service Artifact Export** — pull useful runtime artifacts from the selected app context
- 🤝 **CDS Debug Friendly** — reuse shared mappings with the companion CDS Debug workflow

---

## 📋 Requirements

- **Visual Studio Code** ≥ 1.90.0
- **Node.js** ≥ 20
- **CF CLI** installed and available in your shell
- SAP BTP and Cloud Foundry access
- HANA bindings for SQL workflows
- Event Mesh bindings for subscribe and publish workflows

---

## 🏁 Getting Started

### 1 — Install

Search **SAP Tools** in the Visual Studio Code Extensions panel, or install directly from the Marketplace:

```bash
ext install dongtran.sap-tools
```

### 2 — Open the sidebar

Click the **⚡ SAP Tools** icon in the Activity Bar.

### 3 — Pick your SAP BTP scope

Select a region, org, and space. SAP Tools keeps that scope visible while you work.

### 4 — Open an app workflow

Use the app list to open logs, APIs, Event Mesh subscribe/publish tools, SQL, package actions, or service exports.

### 5 — Stay in flow

Investigate runtime behavior from the same app context instead of jumping between terminals, portals, and separate tools.

---

## 🛡️ Safety Notes

- Event Mesh messages are capped by the configured buffer
- CF log streams can be paused without losing the active session
- File logging writes each run to its own timestamped file
- Local registry data is kept outside the project workspace
- Shared CDS Debug mappings can be reused instead of duplicated

---

## 📜 License

[MIT](LICENSE)
