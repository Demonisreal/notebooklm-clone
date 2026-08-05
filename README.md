# NotebookLM-Klon

Quellen hochladen, mit ihnen chatten, und jede Aussage über einen Beleg zurück in die Quelle verfolgen.

![Arbeitsbereich mit Quellen, Chat und markierter Belegstelle](docs/screenshot.jpg)

## Demo

|        |                                     |
| ------ | ----------------------------------- |
| Live   | _wird beim Deployment ergänzt_      |
| Zugang | `demo@notebook.local` / `demo12345` |

Der Demo-Zugang hat ein vorbereitetes Notizbuch mit verarbeiteten Quellen, damit sofort etwas zu sehen ist.

## Was drin ist

- **Quellen**: PDF, DOCX, TXT, Markdown, Website-Adressen und eingefügter Text
- **Ingestion mit sichtbarem Status** — die Verarbeitung läuft im Hintergrund, der Status wandert per Supabase Realtime ohne Polling ins Frontend
- **Chat mit Belegen**, der die Antwort streamt und ausschließlich aus den ausgewählten Quellen antwortet
- **Klickbare Belege**, die in die Quelle springen und die Fundstelle markieren
- **Quellenauswahl** per Auswahlkästchen — nur Angekreuztes wird durchsucht
- **Hybride Suche** aus Vektor- und Volltextsuche, zusammengeführt per Reciprocal Rank Fusion
- **Notizen**, manuell oder als übernommene Chat-Antwort
- **Studio**: Briefing, häufige Fragen, Lernhilfe und eine Mind Map

## Was bewusst nicht drin ist

- **Kollaboration und Teilen** — braucht ein Rechtemodell über Besitz hinaus und hätte den Kern verdrängt
- **YouTube-Transkripte** — die verfügbaren Bibliotheken brechen bei jeder Änderung an der Plattform, zu unsicher für den laufenden Betrieb
- **Audio Overview** — der teuerste Posten in Zeit, ohne etwas über Architektur auszusagen
- **Mehrmandantenfähigkeit** — ein Notizbuch gehört genau einem Konto; alles darüber hinaus braucht ein eigenes Rechtemodell

## Architektur

```
Browser
  │
  ├── Next.js ──────────────── Supabase Auth      (Anmeldung, JWT)
  │      │                     Supabase Storage   (Direktupload per Signed URL)
  │      └─ fetch + Bearer JWT
  │            ▼
  │      Nest.js API
  │            ├── SourcesModule   Extraktion, Chunking, Embedding
  │            ├── ChatModule      Retrieval, Prompt, SSE-Stream
  │            ├── StudioModule    Briefing, FAQ, Mind Map
  │            └── SupabaseModule  Client mit User-Token, RLS greift
  │            │
  │            ├─────────► Gemini
  │            └─────────► Postgres + pgvector
```

Next.js kümmert sich um Darstellung und Sitzung. Sämtliche Fachlogik liegt in Nest — das Frontend spricht nie direkt mit der Datenbank. Dateien gehen per Signed URL direkt in den Storage; die API ist nie Datei-Proxy, sonst laufen Speicher und Zeitlimits bei großen PDFs voll.

## Entscheidungen

### 1. Hybride Suche statt reiner Vektorsuche

Vektorsuche findet Eigennamen, Paragraphen und Zahlen schlecht. Wer nach „§ 15a" oder einem Produktnamen fragt, wird über Volltextsuche zuverlässiger bedient. Beide Ranglisten werden per Reciprocal Rank Fusion zusammengeführt.

Drei Details, die ich an der laufenden Datenbank nachgemessen habe, weil sie sonst **still** danebengehen:

`hnsw.iterative_scan` ist standardmäßig aus. Der Index holt `ef_search` Kandidaten, und der `WHERE`-Filter wirft sie danach weg. Bei einem Notizbuch mit 305 Chunks und einer ausgewählten Quelle mit 5 Chunks kommt so **nichts** zurück. Mit `relaxed_order` liefert dieselbe Abfrage genau die erwarteten 5 Treffer — genau das macht die Quellenauswahl überhaupt erst verlässlich.

Ein leeres Array ist nicht `NULL`: `'x' = any(array[]::uuid[])` ergibt `false`. Schickt das Frontend beim Abwählen aller Quellen ein leeres Array, findet die Suche nichts. Die Bedingung prüft deshalb zusätzlich `cardinality(...) = 0`.

`websearch_to_tsquery` verknüpft mit **UND**. „Was ist die Kündigungsfrist und wie lange läuft die Garantie?" wird zu `'kuendigungsfrist' & 'garanti'` und findet null Zeilen, obwohl beide Begriffe einzeln vorkommen — die hybride Suche wäre damit heimlich eine reine Vektorsuche gewesen. Die Lexeme werden jetzt mit ODER verknüpft, sortiert wird über `ts_rank_cd` und anschließend RRF.

### 2. 768 Dimensionen, selbst normalisiert

Die HNSW-Indizes von pgvector arbeiten bis maximal 2000 Dimensionen, `gemini-embedding-2` liefert standardmäßig 3072. Also 768 über `outputDimensionality`.

Entscheidend dabei: Nur bei den vollen 3072 Dimensionen sind die Vektoren vorab normalisiert. Bei jeder kleineren Dimension muss man selbst normalisieren, sonst rechnet die Kosinus-Ähnlichkeit still falsch — die Suche funktioniert scheinbar, liefert aber schlechtere Treffer.

### 3. Row Level Security mit User-Token statt Service-Role

Nest baut pro Anfrage einen Supabase-Client mit dem JWT des Nutzers. Dadurch prüft die Datenbank die Zugriffsrechte, nicht der Controller — ein Fehler in der Controller-Logik führt nicht sofort zum Datenleck. Der Service-Role-Schlüssel wird ausschließlich in der Ingestion benutzt, wo kein Nutzerkontext mehr existiert.

Nachgewiesen: Ein zweiter Nutzer bekommt beim Zugriff auf ein fremdes Notizbuch ein 404, und ein direkter Aufruf der Suchfunktion auf fremde Notizbuch-IDs liefert eine leere Menge.

### 4. Der Beleg-Viewer zeigt den extrahierten Text, nicht das Original-PDF

Indexiert wird der extrahierte Text, und `char_start`/`char_end` zeigen exakt dorthin. Beim gerenderten PDF passen diese Offsets nicht mehr zum Textlayer; man müsste die Stelle per Textsuche wiederfinden, was an Zeilenumbrüchen, Silbentrennung und Ligaturen regelmäßig scheitert. Der Text-Viewer funktioniert außerdem für alle Quelltypen gleich — ein PDF-Viewer bräuchte für DOCX, Web und eingefügten Text einen zweiten.

Ich zeige damit genau das, was auch durchsucht wurde.

### 5. Ingestion in-process statt Queue

Bei einem einzelnen API-Container genügt asynchrone Verarbeitung im Prozess mit Statusverfolgung in der Datenbank. Eine echte Queue (BullMQ mit Redis) wäre die saubere Lösung, kostet aber einen halben Tag.

Der bekannte Nachteil: Startet der Prozess während einer Verarbeitung neu, bliebe die Quelle auf `processing` stehen. Dagegen schreibt die Ingestion einen Zeitstempel mit, und beim Hochfahren werden zu alte Einträge auf `error` gesetzt und lassen sich neu anstoßen. **Ab dem zweiten API-Container würde ich auf BullMQ wechseln**, weil dann mehrere Prozesse dieselbe Quelle greifen könnten.

## Lokal starten

Voraussetzungen: Node ≥ 22, pnpm, Docker.

```bash
pnpm install
pnpm db:start                 # startet Supabase im Docker, wendet die Migrationen an

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Schlüssel aus der Ausgabe von "supabase status" eintragen

pnpm dev                      # API auf :3001, Web auf :3000
```

Ohne API-Schlüssel läuft alles mit `LLM_PROVIDER=fake`: Der Fake-Anbieter erzeugt aus einem Hash des Textes reproduzierbare, normalisierte Vektoren. Gleicher Text ergibt immer denselben Vektor, ähnlicher Text aber _keine_ ähnlichen — die Suche ist damit nicht semantisch, aber die gesamte Kette von Chunking über Retrieval bis zum Beleg-Rücksprung ist entwickelbar und testbar. Für echte Antworten `LLM_PROVIDER=gemini` setzen und einen Schlüssel hinterlegen.

## Tests

```bash
pnpm test
```

Kein Abdeckungstheater, sondern Tests dort, wo Logik **still** falsch sein kann:

| Datei                   | Prüft                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chunker.spec.ts`       | Die Invariante `extracted_text.slice(charStart, charEnd) === content` — auch bei überlangen Absätzen und Text ohne Leerzeichen. Bricht sie, zeigen alle Belege daneben, ohne dass etwas abstürzt |
| `citations.spec.ts`     | Erfundene Belegnummern werden entfernt, verbleibende lückenlos neu nummeriert                                                                                                                    |
| `match-chunks.spec.ts`  | Die Suche gegen die echte Datenbank, inklusive des Falls, der ohne `iterative_scan` leer zurückkäme                                                                                              |
| `pdf.spec.ts`           | Seitenzuordnung über Seitengrenzen hinweg; Scans ohne Textlayer werden erkannt                                                                                                                   |
| `html.spec.ts`          | Navigation und Fußzeile fliegen raus, statt in jedem Chunk zu landen                                                                                                                             |
| `fake.provider.spec.ts` | Embeddings sind reproduzierbar und normalisiert                                                                                                                                                  |

`match-chunks.spec.ts` überspringt sich selbst, wenn kein lokales Supabase erreichbar ist.

## Was ich mit mehr Zeit machen würde

- **Reranking** der Treffer mit einem Cross-Encoder — RRF ordnet gut, aber ein Reranker ordnet besser
- **Bewertungsdatensatz** für die Retrieval-Qualität: feste Fragen mit erwarteten Fundstellen, damit sich Änderungen an Chunking oder Suche messen statt erahnen lassen
- **BullMQ** für die Ingestion, sobald mehr als ein API-Container läuft
- **Feinere Belegstellen**: aktuell wird der ganze Chunk markiert. Den belegenden Satz innerhalb des Chunks zu bestimmen, würde die Markierung deutlich präziser machen
