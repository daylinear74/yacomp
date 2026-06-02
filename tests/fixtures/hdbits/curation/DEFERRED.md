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
| `0202-topic-56469` | Desired title is based on two details links; user allowed ignore if it hurts samples. | Add a narrow details-link title strategy only if more examples appear. |
| `0343-topic-59566` | User wants topic `GBR vs GER`, but the OP has local per-section labels. Forcing H1 over local labels is high risk. | Re-evaluate after per-block candidate ranking can distinguish section notes from source labels. |
| `1141-topic-70474` | Reply-local prose label; user said ignore if not easy. | Revisit with a reply-local adjacent title model, without borrowing H1 blindly. |
| `1256-topic-71071` | First desired comparison lives in another post; current fixture is a reply fragment. | Needs cross-post context or a fixture that includes the referenced post. |
| `1602-topic-73655` | Audio/channel labels are messy and single-case; user explicitly allowed ignore. | Revisit with a dedicated audio/source label pass if more cases cluster. |
| `1640-topic-73859` | Author repeats long tone-map names twice; user allowed ignore if not cleanly fixable. | Revisit with duplicate-title collapse for repeated long HDR/madVR labels. |
| `1944-topic-75717` | Same duplicated long tone-map-name shape as `1640`; user allowed ignore if not cleanly fixable. | Revisit with duplicate-title collapse for repeated long HDR/madVR labels. |
| `2089-topic-76831` | Reply wants H1-like `FRA vs GER vs HKG`, but body has prose/single composite-image context. Borrowing H1 into replies is high risk. | Needs a safe reply-title fallback or explicit local heading signal. |
| `2099-topic-76872` | Same reply/H1-like issue as `2089`. | Needs a safe reply-title fallback or explicit local heading signal. |
| `2109-topic-76909` | Prose labels in reply; user explicitly allowed ignore. | Revisit only if a broader prose-label rejection pass handles it cleanly. |

## Current UI State

The local review marks files should keep these entries as `deferred` whenever
they appear in gain/name/loss review pages. Cases that no longer appear in a
review page still remain tracked here.
