using TaskTracker.Core.Transfer;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>What a page needs to export or import: the transfer service and the file picker, passed around as one.</summary>
public sealed record TransferServices(DataTransferService Service, IFilePickerService Files);