# Vision eval fixtures

**No photos are committed to this repo.** `manifest.json` holds the labels; you supply the images.

## What to do

Drop 20 JPEGs into this folder, named exactly as the `file` field of each row in
[`manifest.json`](./manifest.json). Each row's `note` says what the photo should show.

```
apps/api/scripts/vision-eval/fixtures/
  manifest.json          <- committed
  README.md              <- committed
  exercise-gym.jpg       <- you add these, git-ignored
  exercise-run.jpg
  ...
```

Only `.jpg` is supported: `classifyPhoto` sends the bytes as
`data:image/jpeg;base64,...`, so a PNG renamed to `.jpg` will be sent with the wrong
MIME type. Convert first (`sips -s format jpeg in.png --out out.jpg` on macOS).

You do not need all 20 to start. Any row whose file is missing on disk is skipped with a
warning, and the report says how many fixtures actually ran.

## Making good fixtures

- **Shoot them on a phone, the way a member actually would.** Hand-held, bad lighting,
  cluttered background, slightly tilted. A stock photo of a salad tells you nothing about
  how the model behaves on a badly lit plate of com nha on a plastic table.
- **Keep them small.** Resize to roughly 1024px on the long edge before saving. The image
  is base64-encoded into the request body, so full 12MP originals waste tokens and money
  on every model you evaluate.
- **Strip faces you do not have permission to use.** These files stay on your machine, but
  the bytes are sent to OpenRouter.
- **Vietnamese context matters.** Badminton, pickleball, tra sua, com tam, hot pot, com
  nha. A model that is great at "salad vs burger" can still be useless for this challenge.

### What makes a good negative

The three `unrelated-*` rows are the point of the whole exercise. A model that tags
everything as `exercise` will look excellent on accuracy over exercise photos and will be
unusable in production, because every selfie a member uploads scores +3.

A good negative is **plausible**, not obviously off-topic:

- A selfie in normal clothes indoors - not a screenshot of a spreadsheet.
- A pet or a landscape that contains *some* cue the model may over-read: a park path
  (looks like a run), a person sitting at a table with a phone (looks like a meal).
- A photo where a person is present but nothing is happening. Presence of a human is the
  single biggest driver of false `exercise` and false `group` tags.

The two `ambiguous-*` rows work the same way, but the label is our ruling rather than an
obvious truth. Do not treat a miss on those as a model defect on its own - read the
`reason` text in the results JSON and decide whether the model's argument is better than
ours. If it is, change the label in `manifest.json` and say so in the commit.
