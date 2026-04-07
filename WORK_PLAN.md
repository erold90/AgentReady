# AgentReady — Piano di Lavoro

## Fase 1: Struttura e UI Base
- [x] Directory progetto
- [ ] index.html — layout completo
- [ ] css/style.css — design professionale
- [ ] Responsive, dark mode

## Fase 2: Core Scanner
- [ ] Proxy fetch via allorigins
- [ ] Parser HTML (DOMParser)
- [ ] Estrazione form e campi
- [ ] Rilevamento attributi WebMCP esistenti
- [ ] Rilevamento navigator.modelContext in script

## Fase 3: Analyzer e Scoring
- [ ] Calcolo score 0-100
- [ ] Categorie: forms, descriptions, schema, annotations, security
- [ ] Lista problemi e suggerimenti
- [ ] Gauge circolare animato

## Fase 4: Code Generator
- [ ] Generazione codice dichiarativo (attributi HTML)
- [ ] Generazione codice imperativo (JS registerTool)
- [ ] Inferenza automatica nomi, descrizioni, schema
- [ ] Copia con un click

## Fase 5: Agent Simulator
- [ ] Vista "Before" (come agent vede il sito ora)
- [ ] Vista "After" (con WebMCP applicato)
- [ ] Lista tool esposti
- [ ] Simulazione invocazione

## Fase 6: Report e Export
- [ ] Report HTML scaricabile
- [ ] Confronto competitor (2 URL)
- [ ] Storico scansioni (localStorage)

## Fase 7: Deploy e Launch
- [ ] GitHub repo (erold90/AgentReady)
- [ ] GitHub Pages deploy
- [ ] CF Worker proxy (opzionale)
- [ ] README con GIF/screenshot
- [ ] OG tags e meta SEO
