import { Route, Routes, useLocation } from "react-router";
import { Layout } from "./components/layout.tsx";
import { AdminPage } from "./routes/admin/admin-page.tsx";
import { CreatePage } from "./routes/create-page.tsx";
import { EditPage } from "./routes/edit/edit-page.tsx";
import { GalleryPage } from "./routes/gallery-page.tsx";
import { HowToPlayPage } from "./routes/how-to-play-page.tsx";
import { LoginPage } from "./routes/login-page.tsx";
import { MyGamesPage } from "./routes/my-games-page.tsx";
import { NotFoundPage } from "./routes/not-found-page.tsx";
import { PartyPage } from "./routes/party/party-page.tsx";
import { DaysPage } from "./routes/play/days-page.tsx";
import { PlayPage } from "./routes/play/play-page.tsx";
import { VerifyPage } from "./routes/verify-page.tsx";

// The same paths the dev server and nginx answer with 200 (ADR 0018); anything else is a 404 there and here
export function App({ legacyWiped }: { legacyWiped: boolean }) {
  const { pathname } = useLocation();
  // Trailing slashes are not special-cased (ADR 0012): /login/ is not /login
  const slashed = pathname !== "/" && pathname.endsWith("/");
  return (
    <Layout legacyWiped={legacyWiped}>
      {slashed ? (
        <NotFoundPage />
      ) : (
        <Routes>
          <Route caseSensitive path="/" element={<GalleryPage />} />
          <Route caseSensitive path="/g/:slug" element={<PlayPage />} />
          <Route caseSensitive path="/g/:slug/edit" element={<EditPage />} />
          <Route caseSensitive path="/g/:slug/days" element={<DaysPage />} />
          <Route
            caseSensitive
            path="/g/:slug/day/:day"
            element={<PlayPage />}
          />
          <Route caseSensitive path="/create" element={<CreatePage />} />
          <Route caseSensitive path="/my-games" element={<MyGamesPage />} />
          <Route
            caseSensitive
            path="/how-to-play"
            element={<HowToPlayPage />}
          />
          <Route caseSensitive path="/login" element={<LoginPage />} />
          <Route caseSensitive path="/verify" element={<VerifyPage />} />
          <Route caseSensitive path="/admin" element={<AdminPage />} />
          <Route caseSensitive path="/party" element={<PartyPage />} />
          <Route caseSensitive path="/party/:code" element={<PartyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
    </Layout>
  );
}
