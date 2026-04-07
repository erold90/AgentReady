# AgentReady — Session Log

## Sessione 1 — 2026-04-07/08 (Notturna)

### Contesto
Dopo aver analizzato e scartato 4 idee (Smart Paste, FormGhost, GhostClick, TrustLayer), identificato WebMCP come il trend emergente perfetto per un primo mover. WebMCP e il nuovo standard W3C (Google + Microsoft) rilasciato in Chrome 146 Canary (feb 2026) che permette ai siti di esporre azioni strutturate agli AI agent.

### Ricerca Completata
- 150+ ricerche web totali su competitor, fattibilita, mercato
- Competitor mappati: webmcp-checker.com, WebMCP Ready Checker (ext), WebMCP Inspector (ext), webmcpverify.com, web-mcp.net, webmcp-kit, GoogleChromeLabs/webmcp-tools
- GAP identificato: nessun tool fa AUDIT + FIX + GENERATE + TEST insieme
- Domanda verificata: 10+ thread HN, subreddit, tutorial DataCamp, video Wes Bos, articolo SEMrush
- Spec tecnica studiata: navigator.modelContext API, dichiarativo (HTML attrs) + imperativo (JS)

### Decisioni Architetturali
- Stack: HTML + CSS + Vanilla JS (no framework)
- Proxy: allorigins.win per MVP, CF Worker pronto per deploy
- Deploy: GitHub Pages (erold90)
- Design: professionale, ispirato Vercel/Stripe, dark mode
- Scoring: 0-100 su 5 categorie (forms, descriptions, schema, annotations, security)

### Build Log
- [x] Progetto creato: /Users/witerose/Downloads/AgentReady
- [x] Session log e work plan creati
- [x] Memoria aggiornata (file + MCP)
