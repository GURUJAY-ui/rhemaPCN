# Overlaying Rhema on EasyWorship via OBS

This guide sets up Rhema as a **transparent lower-third overlay on top of EasyWorship**, so
the auto-detected verse (from the sermon) or the hymn being sung appears over whatever
EasyWorship is already showing. Everything can run on **one PC**.

```
EasyWorship (songs/background)  ─┐
                                 ├─►  OBS  ─►  Fullscreen Projector / Stream
Rhema (transparent verse/hymn)  ─┘
        via NDI (alpha)
```

Rhema is the **top layer** (only its text is visible); EasyWorship is the **background**.

---

## 1. Install (one time)

All three are on winget (or download from the sites):

| Component | winget id | Notes |
|---|---|---|
| OBS Studio | `OBSProject.OBSStudio` | the compositor |
| OBS NDI plugin (DistroAV) | `DistroAV.DistroAV` | lets OBS receive NDI — **install after OBS** |
| NDI Runtime | `NDI.NDIRuntime` | required for NDI to work |

```powershell
winget install OBSProject.OBSStudio -e
winget install NDI.NDIRuntime -e
winget install DistroAV.DistroAV -e   # after OBS is installed
```

(Rhema already bundles its own NDI sending SDK via `bun run download:ndi-sdk`.)

---

## 2. Rhema side — send the overlay

1. In Rhema, open **Broadcast / Output settings** (top-right).
2. Set the active **theme** to **“Broadcast Overlay”** — it has a transparent background and a
   bottom-centre lower-third, so only the text + its subtle backing box show.
3. Under **NDI**:
   - **Source Name:** `Rhema Output` (default)
   - **Alpha Channel:** **Straight Alpha** (so transparency is preserved)
   - **Resolution:** 1080p, **Frame rate:** 30 (or match your program)
   - Click **Start NDI**.
4. Leave Rhema running. When a verse is detected (or you Go Live a hymn), it streams over NDI
   with a transparent background.

> You do **not** need to open Rhema's projector preview window for this — NDI carries the output.

---

## 3. EasyWorship side — expose its output

Two options:
- **Simplest:** in OBS, capture EasyWorship with a **Window Capture** (or **Display Capture** of
  the screen EasyWorship outputs to).
- **Cleaner (NDI):** enable EasyWorship's own NDI output (Edit → Options → enable NDI), then
  receive it in OBS as an NDI source. See EasyWorship's
  [NDI Setup](https://support.easyworship.com/support/solutions/articles/24000020413-ndi-setup).

---

## 4. OBS side — stack and output

1. Open OBS. In **Sources** (bottom of a scene), add in this order (top of the list = front):
   - **NDI Source** → pick **`Rhema Output`** → **top** of the list.
     - In its properties, leave it as-is; the alpha comes through from Rhema.
   - **EasyWorship** (Window/Display Capture, or NDI Source of EasyWorship) → **below** Rhema.
2. Resize both to fill the canvas (right-click → Transform → *Fit to screen*).
3. Confirm the stacking: EasyWorship fills the screen; Rhema's verse/hymn sits over it as a
   lower-third with the rest transparent.
4. Send OBS to the projector:
   - **Right-click the preview → Fullscreen Projector (Program) → [your projector monitor]**, or
   - use OBS **Virtual Camera** / streaming if you go to a stream.

---

## 5. Service flow

- Operator drives **EasyWorship** for songs/announcements as usual.
- Rhema runs in the background:
  - **Sermon:** start transcription → quoted verses auto-appear as a lower-third over EasyWorship.
  - **Singing:** with **Auto-display** on (Hymns panel), the detected hymn auto-projects; or pick a
    hymn and **Go Live** manually, paging stanzas/slides with ▲▼.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `Rhema Output` not listed in OBS | NDI not started in Rhema, or NDI Runtime / DistroAV not installed. |
| Rhema covers EasyWorship with a solid block | Wrong theme — use **Broadcast Overlay**; and set NDI **Alpha = Straight Alpha**. |
| Rhema source is black where text isn't | Alpha mode is `None/Opaque` — switch to **Straight Alpha**. |
| Nothing shows from EasyWorship | Window Capture lost the window (it must be open/visible), or pick its NDI source instead. |
| Laggy overlay | Lower Rhema NDI to 30 fps / 1080p; close other heavy apps. |
| Single PC, source missing | NDI works over loopback on one PC — just confirm the NDI Runtime is installed. |

---

## Why this and not feeding Rhema into EasyWorship directly?

EasyWorship treats NDI as a *feed/background input*, so it can show Rhema as a source but can't
cleanly composite Rhema's transparent text **on top of** its own lyrics. OBS is built for
layering, so it's the right tool when you want Rhema *over* EasyWorship. If you only need Rhema
as a standalone screen, skip OBS and use Rhema's own projector output instead.
