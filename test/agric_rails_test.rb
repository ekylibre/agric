require 'test_helper'

class AgricRailsTest < ActionDispatch::IntegrationTest
  test 'engine is loaded' do
    assert_equal ::Rails::Engine, Agric::Rails::Engine.superclass
  end

  test 'fonts are served' do
    %w[agric.woff2 agric.woff agric.ttf agric.svg].each do |file|
      get digested_path(file)
      assert_response :success, "expected #{file} to be served"
    end
  end

  test 'compiled stylesheet is served' do
    get digested_path('application.css')
    assert_font_defined(response)
  end

  test 'compiled stylesheet references digested fonts' do
    get digested_path('application.css')
    assert_response :success
    # Propshaft rewrites relative url() to digested asset URLs
    assert_match(%r{/assets/agric-[a-z0-9]+\.woff2}, response.body)
    assert_match(%r{/assets/agric-[a-z0-9]+\.woff}, response.body)
    assert_match(%r{/assets/agric-[a-z0-9]+\.ttf}, response.body)
    assert_match(%r{/assets/agric-[a-z0-9]+\.svg}, response.body)
    # no sprockets helper must leak into compiled output
    assert_no_match(/font-url/, response.body)
  end

  test 'indented sass syntax entrypoint compiles' do
    get digested_path('legacy.css')
    assert_font_defined(response)
  end

  private

  # Propshaft only serves digested URLs, like a real Rails 8 app
  # requesting assets through its helpers.
  def digested_path(logical_path)
    Rails.application.assets.resolver.resolve(logical_path)
  end

  def assert_font_defined(response)
    assert_response :success
    # dart-sass compressed output uses double quotes
    assert_match(/font-family:\s*["']Agric["'];/, response.body)
  end
end
