"use client";

import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AttachmentImage } from "@/components/ui/attachment-link";
import { sanitizeAttachmentUrl } from "@/lib/security/url";
import { validateAttachment } from "@/lib/upload-policy";
import type { AttachmentRef } from "@/types";

export const MAX_FLOW_UPDATE_PHOTOS = 10;
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** Photos only: reuses the shared attachment validation, then restricts to image types. */
export function validatePhoto(file: File): string | null {
  try {
    validateAttachment(file);
    if (!file.type.startsWith("image/")) throw new Error("Envie apenas imagens (JPG, PNG, WEBP ou GIF).");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Arquivo inválido.";
  }
}

interface PhotoPickerProps {
  /** Photos already stored on the update (edit mode). */
  existing?: AttachmentRef[];
  files: File[];
  disabled?: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onRemoveExisting?: (id: string) => void;
  onOpen: (photo: AttachmentRef) => void;
}

export function FlowUpdatePhotoPicker({ existing = [], files, disabled, onAddFiles, onRemoveFile, onRemoveExisting, onOpen }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function handleSelect(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    const accepted: File[] = [];
    for (const file of picked) {
      const problem = validatePhoto(file);
      if (problem) toast.error(`${file.name}: ${problem}`);
      else accepted.push(file);
    }
    const room = MAX_FLOW_UPDATE_PHOTOS - existing.length - files.length;
    if (accepted.length > room) toast.error(`Limite de ${MAX_FLOW_UPDATE_PHOTOS} fotos por atualização.`);
    if (accepted.length && room > 0) onAddFiles(accepted.slice(0, room));
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple
          className="hidden"
          aria-label="Selecionar fotos da atualização"
          onChange={(e) => handleSelect(e.target.files)}
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" />
          Adicionar fotos
        </Button>
      </div>
      {(existing.length > 0 || files.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {existing.map((photo) => (
            <div key={photo.id} className="relative h-16 w-16">
              <button type="button" className="h-full w-full" onClick={() => onOpen(photo)} aria-label={`Ampliar ${photo.name}`}>
                <AttachmentImage attachment={photo} alt={photo.name} className="h-16 w-16 rounded-md border border-border object-cover" />
              </button>
              <RemoveButton label={`Remover ${photo.name}`} disabled={disabled} onClick={() => onRemoveExisting?.(photo.id)} />
            </div>
          ))}
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative h-16 w-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[index]} alt={file.name} className="h-16 w-16 rounded-md border border-border object-cover" />
              <RemoveButton label={`Remover ${file.name}`} disabled={disabled} onClick={() => onRemoveFile(index)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
    >
      <XIcon className="h-3 w-3" />
    </button>
  );
}

/** Read-only thumbnails shown in the history; click opens the enlarged view. */
export function FlowUpdatePhotoGallery({ photos, onOpen }: { photos: AttachmentRef[]; onOpen: (photo: AttachmentRef) => void }) {
  if (photos.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {photos.map((photo) => (
        <button key={photo.id} type="button" onClick={() => onOpen(photo)} aria-label={`Ampliar ${photo.name}`}>
          <AttachmentImage attachment={photo} alt={photo.name} className="h-20 w-20 rounded-md border border-border object-cover hover:border-primary" />
        </button>
      ))}
    </div>
  );
}

export function FlowUpdatePhotoViewer({ photo, onClose }: { photo: AttachmentRef | null; onClose: () => void }) {
  const url = photo ? sanitizeAttachmentUrl(photo.url) : null;
  return (
    <Dialog open={!!photo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogTitle className="truncate text-sm">{photo?.name}</DialogTitle>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={photo?.name} className="mx-auto max-h-[75vh] w-auto max-w-full rounded-md object-contain" />
        ) : (
          <p className="text-sm text-muted-foreground">Anexo inválido</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
