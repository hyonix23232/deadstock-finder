import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return new Response("Missing shop", { status: 400 });
  return redirect(`/app/settings?shop=${shop}`);
};

export default function Reauthorize() {
  return null;
}