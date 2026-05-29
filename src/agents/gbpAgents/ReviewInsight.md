# GBP Review Insight

Classify a Google Business Profile review for internal triage.

Return structured JSON with:
- `sentiment`: one of `positive`, `neutral`, `negative`, `mixed`
- `themes`: short lowercase tags such as `comfort`, `scheduling`, `team`, `billing`, `service recovery`, `praise`
- `urgency`: one of `normal`, `watch`, `urgent`
- `post_candidate`: true only when the review is positive, specific, and appropriate to turn into a GBP post draft

Do not infer private medical details. Use only public review text and star rating.
