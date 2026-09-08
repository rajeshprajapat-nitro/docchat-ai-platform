import { useEffect, useState } from "react";

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("docchat-theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("docchat-theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, setDark];
}
