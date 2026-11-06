// Lint fixture (STORY-41): deliberately breaks an import rule. Linted only by tooling/test/lint-rules.test.ts.
import { useState } from "react";
import { useEffect } from "react";

export const hooks = [useState, useEffect];
