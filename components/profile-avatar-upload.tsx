"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/ui/toast";
import { removeAvatarAction, updateAvatarAction } from "@/app/actions/settings";
import { MAX_AVATAR_BYTES } from "@/lib/avatar-upload";

type ProfileAvatarUploadProps = {
  initialImage?: string | null;
  name?: string | null;
};

export function ProfileAvatarUpload({ initialImage, name }: ProfileAvatarUploadProps) {
  const [image, setImage] = useState<string | null>(initialImage ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const inputId = useId();

  const currentDisplayImage = preview ?? image;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) {
      toast("Image must be 2 MB or smaller.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const validTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast("Please choose a PNG, JPEG, WebP, or GIF image.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Local preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const formData = new FormData();
    formData.set("avatar", file);

    startTransition(async () => {
      try {
        const result = await updateAvatarAction(undefined, formData);
        if (result.ok && result.image) {
          setImage(result.image);
          setPreview(null);
          toast("Profile picture updated.", "success");
        } else {
          setPreview(null);
          toast(result.error ?? "Failed to update profile picture.", "error");
        }
      } catch {
        setPreview(null);
        toast("An unexpected error occurred while uploading.", "error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  const handleRemove = () => {
    if (!image && !preview) return;

    startTransition(async () => {
      try {
        const result = await removeAvatarAction();
        if (result.ok) {
          setImage(null);
          setPreview(null);
          toast("Profile picture removed.", "success");
        } else {
          toast(result.error ?? "Failed to remove profile picture.", "error");
        }
      } catch {
        toast("An unexpected error occurred while removing avatar.", "error");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 py-1">
      <span className="text-[13px] font-bold text-zk-text">Profile picture</span>
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative">
          <Avatar
            name={name}
            image={currentDisplayImage}
            size="lg"
            className="!h-20 !w-20 !text-2xl shadow-sm ring-2 ring-zk-border"
          />
          {isPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-bold text-white">
              ...
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              id={inputId}
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={handleFileChange}
              disabled={isPending}
            />
            <label
              htmlFor={inputId}
              className={`inline-flex h-[38px] cursor-pointer items-center justify-center rounded-full border border-zk-border px-4 text-xs font-bold text-zk-text transition hover:bg-zk-chip focus-within:ring-2 focus-within:ring-electric-blue ${
                isPending ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {isPending ? "Uploading..." : currentDisplayImage ? "Change photo" : "Upload photo"}
            </label>

            {currentDisplayImage ? (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="inline-flex h-[38px] items-center justify-center rounded-full px-3 text-xs font-bold text-zk-muted transition hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
          <span className="text-xs text-zk-muted">
            PNG, JPEG, WebP or GIF. Max 2 MB.
          </span>
        </div>
      </div>
    </div>
  );
}
