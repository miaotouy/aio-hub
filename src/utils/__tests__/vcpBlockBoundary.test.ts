// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { findVcpBlockBoundary } from "../vcpBlockBoundary";

const endMarker = "<<<[END_TOOL_REQUEST]>>>";
const nextStart = "<<<[TOOL_REQUEST]>>>";
const options = {
  endMarker,
  recoveryStartMarkers: [nextStart],
};
const escaped = (text: string) => `「始ESCAPE」${text}「末ESCAPE」`;

// Candidate bounds must keep skipping escaped ends/recovery starts before the visible boundary.
it("selects the visible boundary after multiple escaped protocol examples", () => {
  const value =
    escaped(endMarker + nextStart) + " body " + escaped(nextStart + endMarker);
  const text =
    "prefix" + value + endMarker + escaped("later incomplete content");
  expect(findVcpBlockBoundary(text, 6, options)).toEqual({
    status: "complete",
    endIndex: 6 + value.length,
  });
  const broken = "prefix" + value + nextStart + "valid request" + endMarker;
  expect(findVcpBlockBoundary(broken, 6, options)).toEqual({
    status: "interrupted",
    nextStartIndex: 6 + value.length,
  });
});

// Stream truncation inside ESCAPE must never expose literal request/end examples to execution.
it("waits for escaped values and resumes recovery after their closing delimiter", () => {
  const pending = "「始ESCAPE」" + endMarker + nextStart;
  expect(findVcpBlockBoundary(pending, 0, options)).toEqual({
    status: "unclosed",
  });
  const completeValue = pending + "「末ESCAPE」";
  expect(findVcpBlockBoundary(completeValue, 0, options)).toEqual({
    status: "unclosed",
  });
  expect(findVcpBlockBoundary(completeValue + endMarker, 0, options)).toEqual({
    status: "complete",
    endIndex: completeValue.length,
  });
  expect(findVcpBlockBoundary(completeValue + nextStart, 0, options)).toEqual({
    status: "interrupted",
    nextStartIndex: completeValue.length,
  });
});

// A marker can start before a candidate boundary while extending across it.
it("keeps overlapping escape delimiters visible to the boundary search", () => {
  const text = escaped("literal") + "ESCAPE";
  expect(
    findVcpBlockBoundary(text, 0, {
      endMarker: "ESCAPE",
      recoveryStartMarkers: [],
    })
  ).toEqual({ status: "complete", endIndex: text.length - 6 });
});
