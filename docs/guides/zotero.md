# Zotero

Glossator puts your articles in your Zotero library, each with its summary as a note and its files linked. You can
also accept or reject inbox papers from Zotero.

## What you get in Zotero

| In Zotero | What it holds | Updated when |
|---|---|---|
| Collection `glossator` | One sub-collection per bibliography | You add a bibliography |
| An item per article | Its bibliographic fields, and tags from its record | The record changes |
| A note on each item | The article's summary, as `glossator export` prints it | The summary changes |
| Linked files | The PDF and supplementary files, linked, never uploaded | A file changes |
| Collection `glossator / Inbox` | The papers waiting for your decision, with Haiku's summary | Each sync |

What stays yours:

- Your own tags, notes, annotations and collections. Glossator rewrites only its own notes and tags.
- Your other items. Glossator deletes none of them.
- An article that leaves your library. Its item stays, the sync names it, and you decide.

> [!WARNING]
> Zotero syncs notes to zotero.org, so each article's summary goes there too. That includes the claims you passed
> with `--cited-for`. Keep unpublished work out of your records.

## Before you start

- Zotero 7 on this computer, signed in to your zotero.org account.
- A library with at least one article.

## Set it up

1. Run `uv run glossator zotero setup`. It opens zotero.org's page for a new API key.
2. On that page, tick **Allow library access**, **Allow notes access** and **Allow write access**, then save the key.
3. Paste the key into the terminal. It stays hidden. Glossator checks it and keeps it in
   `~/.config/glossator/zotero-key`, readable only by you.
4. In Zotero, open **Settings → Advanced → Files and Folders**. Set **Linked Attachment Base Directory** to the
   `library/` folder whose path Glossator prints. If Zotero offers to update existing attachments, accept.
5. Accept the dry run Glossator offers. It shows what the first sync would change, and changes nothing.
6. Run the first sync:
   ```sh
   uv run glossator zotero sync
   ```

Check it worked: Zotero shows the `glossator` collection, with one sub-collection per bibliography. Later,
`uv run glossator zotero setup --check` tells you whether the key and the base directory are still right.

## Keep Zotero in step

| Command | What it does |
|---|---|
| `glossator zotero sync` | Applies your inbox decisions from Zotero, then sends your articles and inbox papers |
| `glossator zotero pull` | Applies your inbox decisions only. It takes seconds. |
| `glossator zotero push` | Sends your articles and inbox papers only |
| `glossator build --zotero` | Builds, then syncs |

- Add `--dry-run` to any of them to see what would change, without changing it.
- With a key on this computer, Glossator also syncs after each curation batch and each daily inbox run.
- `glossator build` alone never contacts Zotero.

Glossator matches items by DOI, then by citation key, then by title. It never duplicates an item, even one you
imported from `build/zotero.rdf`.

## Accept or reject in Zotero

1. Open the collection `glossator / Inbox`.
2. Tag a paper `accept` or `reject`.
3. Run `uv run glossator zotero pull`, or wait for the next daily inbox run.

What happens then:

- The first sync adds `accept` (green) and `reject` (red) to your colored tags, after your own. With no colored tags
  yet, they take keys 1 and 2: select a paper and press the key.
- A rejected paper goes to Zotero's trash. `glossator inbox purge` empties it of inbox papers.
- A curated paper becomes its article's item, with your annotations kept.

## Settings

Set these in `library/library.toml`:

| Key | Default | What it does |
|---|---|---|
| `zotero_collection` | `"glossator"` | The top collection Glossator keeps in step |
| `zotero_tag` | `"glossator"` | The tag on the notes and files Glossator manages |

The inbox's papers go to `<zotero_collection> / Inbox` and carry the tag `<zotero_tag> inbox`.

## Several computers

- Each computer that syncs with Zotero needs its own key file.
- Each computer where you open Zotero needs its Linked Attachment Base Directory set to its own `library/`.
- The links are relative to `library/`, so an item opens its file on every computer.

## Manual setups

<details>
<summary>Set it up by hand</summary>

1. On [zotero.org/settings/keys](https://www.zotero.org/settings/keys), create a key with library, notes and write
   access.
2. Create the key file, readable only by you, then paste the key, press Enter and `Ctrl+D`:
   ```sh
   mkdir -p ~/.config/glossator
   (umask 077; cat > ~/.config/glossator/zotero-key)
   ```
3. In Zotero, set the Linked Attachment Base Directory to your `library/` folder.
4. Run `uv run glossator zotero sync --dry-run`, then `uv run glossator zotero sync`.

To keep the key elsewhere, set `GLOSSATOR_ZOTERO_KEY` to its path.

</details>

<details>
<summary>Use Zotero without an API key</summary>

Every `glossator build` also writes `build/zotero.rdf`.

1. In Zotero, choose **File → Import** and pick `build/zotero.rdf`.
2. Choose "Link to files in original location".
3. For later imports, export only the new articles, because Zotero cannot update an import:
   ```sh
   uv run glossator zotero rdf --since 2025-01-31
   ```
4. Import the file it names, such as `build/zotero-since-2025-01-31.rdf`.

</details>

## Next

- [The daily inbox](inbox.md)
- [Privacy](../privacy.md)
- [Troubleshooting](../troubleshooting.md#zotero)
