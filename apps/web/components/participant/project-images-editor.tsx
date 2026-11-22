'use client';

import {
  PROJECT_IMAGES,
  type ImageUpload,
  type ProjectImage,
  type ProjectImageList,
  type ProjectImageType,
} from '@hx/shared';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { projectImageUrl } from '@/lib/project-images';
import { browserSupabase } from '@/lib/supabase/browser';
import { AlertIcon } from '../icons';
import { Busy, PixelGrid } from '../loading-state';

/** The image's size, read in the browser before upload; null if it can't be read. */
function readSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

const isImageType = (type: string): type is ProjectImageType =>
  (PROJECT_IMAGES.types as readonly string[]).includes(type);

/**
 * The team's project images (R41), saved as they change: add (up to 6, 5 MB each, PNG, JPEG or
 * WebP), caption, reorder and remove. The first image is the cover in the gallery.
 */
export function ProjectImagesEditor({
  eventId,
  initial,
}: {
  eventId: string;
  initial: ProjectImage[];
}) {
  const [images, setImages] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const room = PROJECT_IMAGES.max - images.length;

  async function upload(file: File): Promise<boolean> {
    if (!isImageType(file.type)) {
      setError(`${file.name} isn't a PNG, JPEG or WebP image.`);
      return false;
    }
    if (file.size > PROJECT_IMAGES.maxBytes) {
      setError(`${file.name} is over 5 MB. Make it smaller and try again.`);
      return false;
    }
    const supabase = browserSupabase();
    if (!supabase) {
      setError("Image uploads aren't set up here.");
      return false;
    }
    const link = await api<ImageUpload>(`/events/${eventId}/teams/me/images/upload`, {
      method: 'POST',
      body: { content_type: file.type, size: file.size },
    });
    if (!link.ok) {
      setError(link.message);
      return false;
    }
    const sent = await supabase.storage
      .from(PROJECT_IMAGES.bucket)
      .uploadToSignedUrl(link.data.path, link.data.token, file, { contentType: file.type });
    if (sent.error) {
      setError(`${file.name} didn't upload. Check your connection and try again.`);
      return false;
    }
    const size = await readSize(file);
    const added = await api<ProjectImageList>(`/events/${eventId}/teams/me/images`, {
      method: 'POST',
      body: {
        path: link.data.path,
        caption: '',
        width: size?.width ?? null,
        height: size?.height ?? null,
      },
    });
    if (!added.ok) {
      setError(added.message);
      return false;
    }
    setImages(added.data.items);
    return true;
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const chosen = [...files].slice(0, room);
    if (files.length > room) {
      setError(
        `Only ${room} more ${room === 1 ? 'image fits' : 'images fit'}: the rest were left out.`,
      );
    }
    setUploading(chosen.length);
    for (const file of chosen) {
      await upload(file);
      setUploading((n) => n - 1);
    }
    if (input.current) input.current.value = '';
  }

  async function arrange(next: ProjectImage[], key: string) {
    setBusy(key);
    setError(null);
    const result = await api<ProjectImageList>(`/events/${eventId}/teams/me/images`, {
      method: 'PUT',
      body: { images: next.map((i) => ({ id: i.id, caption: i.caption })) },
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setImages(result.data.items);
  }

  function move(index: number, by: -1 | 1) {
    const next = [...images];
    const [image] = next.splice(index, 1);
    if (!image) return;
    next.splice(index + by, 0, image);
    void arrange(next, `move:${image.id}`);
  }

  function saveCaption(image: ProjectImage, caption: string) {
    if (caption.trim() === image.caption) return;
    void arrange(
      images.map((i) => (i.id === image.id ? { ...i, caption: caption.trim() } : i)),
      `caption:${image.id}`,
    );
  }

  async function remove(image: ProjectImage) {
    if (!window.confirm('Remove this image?')) return;
    setBusy(`remove:${image.id}`);
    setError(null);
    const result = await api<ProjectImageList>(`/events/${eventId}/teams/me/images/${image.id}`, {
      method: 'DELETE',
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setImages(result.data.items);
  }

  return (
    <fieldset className="image-editor">
      <legend className="label">Images</legend>
      <p className="hint" style={{ margin: 0 }}>
        Screenshots or photos of your project, up to {PROJECT_IMAGES.max}. PNG, JPEG or WebP, 5 MB
        each. The first one is the cover in the gallery.
      </p>

      {images.length > 0 ? (
        <ol className="image-editor-grid">
          {images.map((image, index) => (
            <li key={image.id} className="panel image-editor-item">
              <div className="image-editor-thumb">
                <Image
                  src={projectImageUrl(image.path)}
                  alt={image.caption || `Image ${index + 1}`}
                  width={image.width ?? 640}
                  height={image.height ?? 400}
                  sizes="(min-width: 720px) 240px, 50vw"
                  unoptimized
                />
                {index === 0 ? (
                  <span className="chip chip-success image-editor-cover">Cover</span>
                ) : null}
              </div>
              <input
                className="input"
                aria-label={`Caption for image ${index + 1}`}
                placeholder="Caption"
                maxLength={PROJECT_IMAGES.captionMax}
                defaultValue={image.caption}
                disabled={busy !== null}
                onBlur={(e) => saveCaption(image, e.target.value)}
              />
              <div className="row-between">
                <span className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Move image ${index + 1} earlier`}
                    disabled={busy !== null || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Move image ${index + 1} later`}
                    disabled={busy !== null || index === images.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    →
                  </button>
                  {busy === `move:${image.id}` || busy === `caption:${image.id}` ? (
                    <PixelGrid />
                  ) : null}
                </span>
                <button
                  type="button"
                  className="link-button small"
                  style={{ color: 'var(--danger)' }}
                  disabled={busy !== null}
                  onClick={() => void remove(image)}
                >
                  {busy === `remove:${image.id}` ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {room > 0 ? (
        <div>
          <input
            ref={input}
            type="file"
            accept={PROJECT_IMAGES.types.join(',')}
            multiple
            className="visually-hidden"
            id={`images-${eventId}`}
            onChange={(e) => void addFiles(e.target.files)}
          />
          <label
            htmlFor={`images-${eventId}`}
            className="btn"
            aria-disabled={uploading > 0}
            onClick={(e) => {
              if (uploading > 0) e.preventDefault();
            }}
          >
            {uploading > 0 ? (
              <Busy>{`Uploading ${uploading === 1 ? '1 image' : `${uploading} images`}…`}</Busy>
            ) : images.length === 0 ? (
              'Add images'
            ) : (
              'Add more images'
            )}
          </label>
        </div>
      ) : null}

      {error ? (
        <span className="field-error" role="alert">
          <AlertIcon width={16} height={16} /> {error}
        </span>
      ) : null}
    </fieldset>
  );
}
