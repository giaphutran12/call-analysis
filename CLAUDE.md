# Claude Code Instructions for Revamped Analysis Project

## Code Quality Rules

### File Size Limits
**IMPORTANT: No file should exceed 400 lines of code**
- If any file grows beyond 400 lines, it MUST be refactored and broken down into smaller, more manageable components
- This applies to all TypeScript, JavaScript, JSX, TSX files
- Test files may slightly exceed this if necessary, but should still be kept as concise as possible
- Documentation files (*.md) are exempt from this rule

### How to Handle Large Files
When a file exceeds 400 lines:
1. Identify logical separations (functions, components, utilities)
2. Extract related functionality into separate files
3. Create sub-components for large React components
4. Move utility functions to dedicated utility files
5. Consider using composition patterns to break down complex components

## Project Context
This is a modern Next.js/TypeScript revamp of the call center analytics pipeline with:
- Next.js 15.5.2 with Turbopack
- TypeScript for type safety
- Tailwind CSS v4 for styling
- shadcn/ui component library
- React 19.1.0
- Full testing with Jest and React Testing Library

## Development Guidelines

### Code Standards
- Use TypeScript strict mode for maximum type safety
- Follow existing patterns and conventions in the codebase
- Maintain clean separation of concerns (service layer, API routes, UI components)
- Always use absolute imports from the project root
- Implement proper error handling with user-friendly messages

### Component Guidelines
- Use shadcn/ui components for consistency
- Implement loading states and error boundaries
- Ensure responsive design with Tailwind CSS
- Add proper TypeScript interfaces for all props
- Keep components focused and single-purpose

### Testing Requirements
- Write tests for all new functionality
- Maintain test coverage above 80%
- Use React Testing Library for component tests
- Mock external dependencies appropriately
- Run tests before committing changes

### Before Committing
1. Run linting: `npm run lint`
2. Run type checking: `npm run typecheck` (if available)
3. Run tests: `npm test`
4. Ensure no files exceed 400 lines
5. Check for API keys or sensitive data
6. Review all changes with `git diff`

## File Organization
```
/components
  /pipeline - Pipeline stage components (keep under 400 lines each)
  /ui - shadcn/ui components
/lib
  /services - Business logic services
  /types - TypeScript type definitions
  /utils - Utility functions
  /config - Configuration and validation
/app
  /api - Next.js API routes
```

## Pipeline Stages Status
- ✅ Stage 1: Get Call IDs (Complete)
- ✅ Stage 2: Download Audio (Complete)
- ✅ Stage 3: Transcribe Audio (Complete)
- ⏳ Stage 4: Upload to Bubble (Pending)
- ⏳ Stage 5: Analyze with GPT-4 (Pending)

## Environment Variables
All API keys should be in `.env.local` and validated with Zod schemas in `/lib/config/env-validation.ts`

## Git Workflow
- Always create feature branches for new work
- Never commit directly to main
- Use descriptive commit messages
- Create pull requests for code review
- Test thoroughly before merging

## Performance Considerations
- Implement proper caching strategies
- Use React.memo for expensive components
- Optimize re-renders with proper dependency arrays
- Consider virtualization for large lists
- Monitor bundle size impact

Last Updated: January 2025