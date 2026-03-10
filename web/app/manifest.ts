import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "上早八",
    short_name: "上早八",
    description: "面向学生的课表 App：早八别迟到",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf2",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
