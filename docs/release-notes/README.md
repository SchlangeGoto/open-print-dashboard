# Release notes

Every release tag needs a short, user-facing note before it is pushed:

```
docs/release-notes/vX.Y.Z.md
```

The Android release workflow uses this file verbatim. It does not use GitHub's
generated changelog, which lists every dependency bump and is not useful to a
dashboard user.

Keep it to roughly one screen:

- a two-sentence summary,
- 3–6 highlights,
- only fixes a user can notice,
- upgrade steps (migrations, image tags, app builds),
- a required `compare/<previous>...<this>` link at the bottom.

The full commit list stays available through that compare link.
