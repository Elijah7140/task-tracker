namespace TaskTracker.Presentation.Markdown;

/// <summary>Limits the nodes and expanded text in a single preview.</summary>
internal sealed class MarkdownDisplayBudget
{
    private int remainingNodes = MarkdownParser.MaxNodes;
    private int remainingText = MarkdownParser.MaxDisplayTextLength;

    public bool IsTruncated { get; private set; }

    public bool TakeNode(int textLength = 0)
    {
        if (remainingNodes == 0 || !TakeText(textLength))
        {
            IsTruncated = true;
            return false;
        }

        remainingNodes--;
        return true;
    }

    public bool TakeText(int length)
    {
        if (IsTruncated || length > remainingText)
        {
            IsTruncated = true;
            return false;
        }

        remainingText -= length;
        return true;
    }
}