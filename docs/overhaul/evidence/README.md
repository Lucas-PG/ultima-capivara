# Evidence

The screenshots and comparison boards that agents saved here during the overhaul (about 410 MB, 1,776 images) were removed from the working tree on 2026-10-02 to keep checkouts light. The measurement receipts (JSON, logs, notes) stay here.

The images are still in git history. To find the removal commit and restore any of them:

```bash
git log --diff-filter=D --format='%h %s' -- docs/overhaul/evidence | head -1
git checkout <that commit>^ -- docs/overhaul/evidence/<path>
```

Image links in the overhaul reports point at these removed files; restore them as above to view one.
