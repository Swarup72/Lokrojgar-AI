
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

function getUserId(user) {
  return (
    user?._id ||
    user?.id ||
    user?.userId ||
    ""
  );
}

function readProfilePhoto(userId, role) {
  if (!userId || !role) return "";

  try {
    return (
      localStorage.getItem(
        `lokrozgar-profile-photo-${userId}-${role}`
      ) || ""
    );
  } catch {
    return "";
  }
}

export function ProfileAvatar({
  role = "worker",
  size = 48,
  className = "",
  style = {},
}) {
  const { user } = useAuth();

  const userId = getUserId(user);

  const [photo, setPhoto] = useState(() =>
    readProfilePhoto(userId, role)
  );

  useEffect(() => {
    const updatePhoto = () => {
      setPhoto(readProfilePhoto(userId, role));
    };

    updatePhoto();

    window.addEventListener("storage", updatePhoto);
    window.addEventListener(
      "lokrozgar-profile-photo-updated",
      updatePhoto
    );

    // Also detect photo updates when returning
    // from the Profile page.
    window.addEventListener("focus", updatePhoto);

    const interval = window.setInterval(updatePhoto, 1000);

    return () => {
      window.removeEventListener("storage", updatePhoto);
      window.removeEventListener(
        "lokrozgar-profile-photo-updated",
        updatePhoto
      );
      window.removeEventListener("focus", updatePhoto);
      window.clearInterval(interval);
    };
  }, [userId, role]);

  const avatarStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: "50%",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#e8f3ff",
    border: "2px solid #dbeafe",
    flexShrink: 0,
    ...style,
  };

  return (
    <div className={className} style={avatarStyle}>
      {photo ? (
        <img
          src={photo}
          alt="Profile"
          onError={() => setPhoto("")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
            display: "block",
          }}
        />
      ) : (
        <UserRound
          size={Math.round(size * 0.5)}
          color="#2563eb"
          aria-label="Default profile picture"
        />
      )}
    </div>
  );
}
