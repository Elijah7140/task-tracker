namespace TaskTracker.Core;

/// <summary>A user-correctable input or domain rule violation.</summary>
public sealed class DomainRuleException : Exception
{
    public DomainRuleException(string message) : base(message)
    {
    }
}