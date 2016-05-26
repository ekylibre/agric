require 'test_helper'

class AgricRailsTest < ActionDispatch::IntegrationTest
  teardown { clean_sprockets_cache }

  test 'engine is loaded' do
    assert_equal ::Rails::Engine, Agric::Rails::Engine.superclass
  end

  test 'fonts are served' do
    get '/assets/agric.eot'
    assert_response :success
    get '/assets/agric.ttf'
    assert_response :success
    get '/assets/agric.woff'
    assert_response :success
  end

  test 'stylesheets are served' do
    get '/assets/agric.css'
    assert_font_defined(response)
  end

  test 'stylesheets contain asset pipeline references to fonts' do
    get '/assets/agric.css'
    assert_match '/assets/agric.eot', response.body
    assert_match '/assets/agric.eot?#iefix', response.body
    assert_match '/assets/agric.woff', response.body
    assert_match '/assets/agric.ttf',  response.body
    assert_match '/assets/agric.svg', response.body
  end

  test 'stylesheet is available in a css sprockets require' do
    get '/assets/sprockets-require.css'
    assert_font_defined(response)
  end

  test 'stylesheet is available in a sass import' do
    get '/assets/sass-import.css'
    assert_font_defined(response)
  end

  test 'stylesheet is available in a scss import' do
    get '/assets/scss-import.css'
    assert_font_defined(response)
  end

  private

  def clean_sprockets_cache
    FileUtils.rm_rf File.expand_path('../dummy/tmp', __FILE__)
  end

  def assert_font_defined(response)
    assert_response :success
    assert_match(/font-family:\s*'Agric';/, response.body)
  end
end
