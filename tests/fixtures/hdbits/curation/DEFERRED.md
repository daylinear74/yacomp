# Deferred HDBits Curation Cases

These are not "do not care" cases. They are cases where the current owner
ruling says the expected result may be real, but fixing it with the current
parser shape would require broad logic that is likely to damage more common
cases. Keep them marked as `deferred` in the local review UI and revisit after
the `MODEL.md` collect-then-select refactor is further along.

## Deferred List

| Case | Current reason to defer | Likely future work |
| --- | --- | --- |
| `0119-topic-53821` | Chaotic prose labels; user explicitly allowed ignore. | Revisit only if a broader prose-label rejection pass handles it cleanly. |
| `0315-torrent-781192` | Torrent fixture is an uploader page fragment; current parser sees `SUMMARY / NOTES / LOGS` as columns. User agreed not to broaden parser logic for this singleton shape. | Revisit only if more uploader-page fragments appear in the torrent dump. |
| `0316-torrent-781285` | Same uploader-page fragment shape as `0315`. | Revisit only if more uploader-page fragments appear in the torrent dump. |
| `0343-topic-59566` | User wants topic `GBR vs GER`, but the OP has local per-section labels. Forcing H1 over local labels is high risk. | Re-evaluate after per-block candidate ranking can distinguish section notes from source labels. |
| `0732-topic-65938` | Old baseline split a release line and `video size` metadata as two columns. This is likely a false positive, but it is kept deferred until the source-label model is reviewed. | Decide whether release-vs-size losses should be accepted as false-positive removals in the next baseline pass. |
| `0784-topic-66637` | Same release-line vs `video size` metadata shape as `0732`. | Decide together with `0732`. |
| `1141-topic-70474` | Reply-local prose label; user said ignore if not easy. | Revisit with a reply-local adjacent title model, without borrowing H1 blindly. |
| `1256-topic-71071` | First desired comparison lives in another post; current fixture is a reply fragment. | Needs cross-post context or a fixture that includes the referenced post. |
| `1602-topic-73655` | Audio/channel labels are messy and single-case; user explicitly allowed ignore. | Revisit with a dedicated audio/source label pass if more cases cluster. |
| `2089-topic-76831` | Reply wants H1-like `FRA vs GER vs HKG`, but body has prose/single composite-image context. Borrowing H1 into replies is high risk. | Needs a safe reply-title fallback or explicit local heading signal. |
| `2099-topic-76872` | Same reply/H1-like issue as `2089`. | Needs a safe reply-title fallback or explicit local heading signal. |
| `2109-topic-76909` | Prose labels in reply; user explicitly allowed ignore. | Revisit only if a broader prose-label rejection pass handles it cleanly. |
| `2364-topic-78834` | Old baseline split a prose/full-range explanation into column names. This is likely a false positive, but it is kept deferred until the source-label model is reviewed. | Decide whether prose-label losses should be accepted as false-positive removals in the next baseline pass. |
| `2912-topic-81281` | Generic `Source 1` ... `Source 5` labels were lost. Restoring this broadly may re-open numeric/generic-label false positives. | Revisit after generic source labels can be separated from frame indices and row numbers. |

## Wrong/Backlog, Not Deferred

When a local mark says the original/baseline output is right (for example,
`ori is right`), keep that row in `wrong` even if the case is hard. The parser
should either recover the original behavior or the owner should explicitly
accept a new baseline. Do not move these rows to `deferred` just to unblock a
baseline update.

Known original-right loss rows from the current pass:

| Case | Why it stays wrong |
| --- | --- |
| `0202-topic-56469` | Details-link source labels were the intended comparison signal; this needs parser recovery/review, not deferral. |
| `1640-topic-73859` | Original 3-column HDR/madVR comparison was marked right; keep as a wrong/backlog item until a safe duplicate-title strategy exists. |
| `1944-topic-75717` | Same long HDR/madVR duplicate-title shape as `1640`; keep marked wrong unless the owner explicitly accepts deferral or a changed baseline. |

## Current UI State

The local review marks files should keep these entries as `deferred` whenever
they appear in gain/name/loss review pages. Cases that no longer appear in a
review page still remain tracked here.

As of 2026-06-02, the full-corpus baseline is not ready to update: gain/name
have no wrong rows, but loss review still has unresolved `wrong` rows where the
baseline/original behavior was marked correct.
