type Attachment = { id: string; fileName: string; mimeType: string };

/** Renders note/message attachments: images as thumbnails, others as links. */
export default function Attachments({ items }: { items: Attachment[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) =>
        a.mimeType.startsWith("image/") ? (
          <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attachments/${a.id}`}
              alt={a.fileName}
              className="h-20 w-20 rounded-md border border-gray-200 object-cover"
            />
          </a>
        ) : (
          <a
            key={a.id}
            href={`/api/attachments/${a.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-accent-600 hover:underline"
          >
            📎 {a.fileName}
          </a>
        )
      )}
    </div>
  );
}

/** A labeled multi-file photo input for note/message forms. */
export function PhotoInput({ name = "photos" }: { name?: string }) {
  return (
    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-navy-600">
      <span className="rounded-md border border-navy-200 bg-white px-2 py-1 hover:bg-navy-50">
        📷 Add photos
      </span>
      <input type="file" name={name} multiple accept="image/*,application/pdf" className="text-xs text-gray-500" />
    </label>
  );
}
