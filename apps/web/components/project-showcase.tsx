'use client';

import type { ProjectImage } from '@hx/shared';
import Image from 'next/image';
import { useState } from 'react';
import { projectImageUrl } from '@/lib/project-images';

/**
 * A project's images (R41): the selected one large in a frame with its caption, the rest as
 * thumbnails underneath. The first image is the project's cover.
 */
export function ProjectShowcase({ images, title }: { images: ProjectImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];
  if (!current) return null;
  const alt = (image: ProjectImage, i: number) =>
    image.caption || `${title || 'Project'}, image ${i + 1} of ${images.length}`;

  return (
    <figure className="showcase">
      <div className="frame showcase-main">
        <Image
          src={projectImageUrl(current.path)}
          alt={alt(current, index)}
          width={current.width ?? 1600}
          height={current.height ?? 1000}
          sizes="(min-width: 900px) 820px, 100vw"
          unoptimized
          priority={index === 0}
        />
      </div>
      {current.caption ? (
        <figcaption className="showcase-caption">{current.caption}</figcaption>
      ) : null}
      {images.length > 1 ? (
        <div className="showcase-thumbs" role="group" aria-label="Project images">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              className="showcase-thumb"
              aria-pressed={i === index}
              aria-label={`Show image ${i + 1}${image.caption ? `: ${image.caption}` : ''}`}
              onClick={() => setIndex(i)}
            >
              <Image
                src={projectImageUrl(image.path)}
                alt=""
                width={image.width ?? 320}
                height={image.height ?? 200}
                sizes="120px"
                unoptimized
              />
            </button>
          ))}
        </div>
      ) : null}
    </figure>
  );
}
