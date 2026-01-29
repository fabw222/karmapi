"use client";

import { FC, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { useCreateMarket } from "@/hooks/useCreateMarket";

interface CreateMarketFormProps {
  onMarketCreated?: (marketId: string) => void;
}

export const CreateMarketForm: FC<CreateMarketFormProps> = ({
  onMarketCreated,
}) => {
  const { publicKey, connected } = useWallet();
  const router = useRouter();
  const { createMarket, isLoading, error, reset } = useCreateMarket();

  const [formData, setFormData] = useState({
    question: "",
    description: "",
    duration: "7", // days
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const [formError, setFormError] = useState<string | null>(null);

  const validateForm = (): boolean => {
    if (!formData.question.trim()) {
      setFormError("Question is required");
      return false;
    }
    if (formData.question.length > 128) {
      setFormError("Question must be less than 128 characters");
      return false;
    }
    if (!formData.description.trim()) {
      setFormError("Description is required");
      return false;
    }
    if (formData.description.length > 512) {
      setFormError("Description must be less than 512 characters");
      return false;
    }
    const duration = parseFloat(formData.duration);
    if (isNaN(duration) || duration <= 0 || duration > 365) {
      setFormError("Duration must be greater than 0 and at most 365 days");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setFormError(null);
    reset();

    if (!connected || !publicKey) {
      setFormError("Please connect your wallet");
      return;
    }

    if (!validateForm()) {
      return;
    }

    const result = await createMarket({
      title: formData.question.trim(),
      description: formData.description.trim(),
      durationDays: parseFloat(formData.duration),
    });

    if (result) {
      onMarketCreated?.(result.marketAddress);
      router.push(`/market/${result.marketAddress}`);
    }
  };

  const durationOptions = [
    { value: "0.000694", label: "1 minute (test)" },
    { value: "1", label: "1 day" },
    { value: "3", label: "3 days" },
    { value: "7", label: "1 week" },
    { value: "14", label: "2 weeks" },
    { value: "30", label: "1 month" },
    { value: "90", label: "3 months" },
    { value: "180", label: "6 months" },
    { value: "365", label: "1 year" },
  ];

  return (
    <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6">
        Create a Prediction Market
      </h2>

      {!connected ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">
            Connect your wallet to create a market
          </p>
          <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question */}
          <div>
            <label
              htmlFor="question"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Question *
            </label>
            <input
              type="text"
              id="question"
              name="question"
              value={formData.question}
              onChange={handleChange}
              placeholder="Will Bitcoin reach $100,000 by end of 2024?"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              maxLength={128}
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.question.length}/128 characters
            </p>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Description *
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Provide clear resolution criteria. What conditions must be met for YES to win?"
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              maxLength={512}
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.description.length}/512 characters
            </p>
          </div>

          {/* Duration */}
          <div>
            <label
              htmlFor="duration"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Market Duration
            </label>
            <select
              id="duration"
              name="duration"
              value={formData.duration}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white focus:outline-none focus:border-purple-500"
            >
              {durationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Market Creation Fee Info */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              Market Creation Info
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Creation Fee</span>
                <span className="text-white">0.01 SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Platform Fee on Winnings</span>
                <span className="text-white">2%</span>
              </div>
            </div>
          </div>

          {(formError || error) && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-400 text-sm">
              {formError || error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 rounded-lg font-semibold text-white transition-all disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating Market...
              </span>
            ) : (
              "Create Market"
            )}
          </button>
        </form>
      )}
    </div>
  );
};
