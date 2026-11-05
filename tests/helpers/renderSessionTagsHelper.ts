import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SessionTags from "../../components/SessionTags";

const input = JSON.parse(process.argv[2] || "{}");
const html = renderToStaticMarkup(React.createElement(SessionTags, { session: input }));
console.log(JSON.stringify({ html }));
